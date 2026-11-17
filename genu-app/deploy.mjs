// Deploys the GenU-style stack onto the AWS Emulator:
//   DynamoDB table (chat history) / Cognito user pool + demo user /
//   5 Lambda functions / API Gateway HTTP API with 5 routes.
// Then writes frontend/.env.local so the web app can reach them.
//
// The emulator keeps everything in memory, so re-running this script
// after an emulator restart recreates the whole stack.
import "dotenv/config";
import { execSync } from "node:child_process";
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
} from "@aws-sdk/client-dynamodb";
import {
  CognitoIdentityProviderClient,
  ListUserPoolsCommand,
  CreateUserPoolCommand,
  CreateUserPoolClientCommand,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  LambdaClient,
  CreateFunctionCommand,
  GetFunctionCommand,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
  AddPermissionCommand,
} from "@aws-sdk/client-lambda";
import {
  ApiGatewayV2Client,
  GetApisCommand,
  DeleteApiCommand,
  CreateApiCommand,
  CreateIntegrationCommand,
  CreateRouteCommand,
  CreateStageCommand,
} from "@aws-sdk/client-apigatewayv2";

const here = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const endpoint = process.env.AWS_ENDPOINT_URL;
const region = process.env.AWS_REGION ?? "us-east-1";
const caPath = process.env.AWS_EMULATOR_CA_PATH;
const caPem = caPath ? fs.readFileSync(caPath, "utf8") : undefined;
const clientConfig = {
  region,
  endpoint,
  requestHandler: caPem
    ? new NodeHttpHandler({ httpsAgent: new https.Agent({ ca: caPem }) })
    : undefined,
};

// The emulator's Lambda runtime carries no credentials, so the deploy
// reads the emulator's own credentials file and injects the values
// into each function's environment.
function readEmulatorCredentials() {
  const file = process.env.AWS_SHARED_CREDENTIALS_FILE;
  const text = fs.readFileSync(file, "utf8");
  const get = (key) => text.match(new RegExp(`^${key}\\s*=\\s*(.+)$`, "m"))?.[1]?.trim();
  return {
    accessKeyId: get("aws_access_key_id"),
    secretAccessKey: get("aws_secret_access_key"),
  };
}

const TABLE_NAME = "GenUChats";
const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "Demo1234!";
const FUNCTION_DEFS = [
  { name: "genu-create-chat", file: "create-chat", route: "POST /chats" },
  { name: "genu-list-chats", file: "list-chats", route: "GET /chats" },
  { name: "genu-get-chat", file: "get-chat", route: "GET /chats/{id}" },
  { name: "genu-delete-chat", file: "delete-chat", route: "DELETE /chats/{id}" },
  { name: "genu-send-message", file: "send-message", route: "POST /chats/{id}/messages" },
];

async function ensureTable(ddb) {
  try {
    await ddb.send(
      new CreateTableCommand({
        TableName: TABLE_NAME,
        BillingMode: "PAY_PER_REQUEST",
        AttributeDefinitions: [
          { AttributeName: "id", AttributeType: "S" },
          { AttributeName: "userId", AttributeType: "S" },
          { AttributeName: "updatedAt", AttributeType: "N" },
        ],
        KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        GlobalSecondaryIndexes: [
          {
            IndexName: "byUser",
            KeySchema: [
              { AttributeName: "userId", KeyType: "HASH" },
              { AttributeName: "updatedAt", KeyType: "RANGE" },
            ],
            Projection: { ProjectionType: "ALL" },
          },
        ],
      })
    );
    console.log("table created:", TABLE_NAME);
  } catch (e) {
    if (e.name !== "ResourceInUseException") throw e;
    console.log("table exists:", TABLE_NAME);
  }
  for (let i = 0; i < 20; i++) {
    const t = await ddb.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
    if (t.Table?.TableStatus === "ACTIVE") return;
    await sleep(1000);
  }
  throw new Error("table did not become ACTIVE");
}

async function ensureUserPool(cip) {
  const pools = await cip.send(new ListUserPoolsCommand({ MaxResults: 20 }));
  let pool = (pools.UserPools ?? []).find((p) => p.Name === "genu-users");
  if (!pool) {
    const created = await cip.send(
      new CreateUserPoolCommand({ PoolName: "genu-users" })
    );
    pool = created.UserPool;
    console.log("user pool created:", pool.Id);
  } else {
    console.log("user pool exists:", pool.Id);
  }
  const client = await cip.send(
    new CreateUserPoolClientCommand({
      UserPoolId: pool.Id,
      ClientName: "genu-web",
      ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"],
    })
  );
  try {
    await cip.send(
      new AdminCreateUserCommand({
        UserPoolId: pool.Id,
        Username: DEMO_EMAIL,
        MessageAction: "SUPPRESS",
        TemporaryPassword: DEMO_PASSWORD,
      })
    );
  } catch (e) {
    if (e.name !== "UsernameExistsException") throw e;
  }
  await cip.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: pool.Id,
      Username: DEMO_EMAIL,
      Password: DEMO_PASSWORD,
      Permanent: true,
    })
  );
  console.log("demo user ready:", DEMO_EMAIL);
  return { poolId: pool.Id, clientId: client.UserPoolClient.ClientId };
}

async function deployFunctions(lambda, functionEnv) {
  console.log("building functions (esbuild)...");
  execSync("npm install --no-audit --no-fund", {
    cwd: path.join(here, "functions"),
    stdio: "inherit",
  });
  execSync("npm run build", {
    cwd: path.join(here, "functions"),
    stdio: "inherit",
  });

  async function waitSettled(name) {
    for (let i = 0; i < 30; i++) {
      const got = await lambda.send(
        new GetFunctionCommand({ FunctionName: name })
      );
      const cfg = got.Configuration;
      if (
        cfg?.State === "Active" &&
        cfg?.LastUpdateStatus !== "InProgress"
      ) {
        return cfg.FunctionArn;
      }
      await sleep(1500);
    }
    throw new Error(`function ${name} did not settle`);
  }

  const arns = {};
  for (const def of FUNCTION_DEFS) {
    const zip = fs.readFileSync(
      path.join(here, "functions", "dist", `${def.file}.zip`)
    );
    let exists = true;
    try {
      await lambda.send(new GetFunctionCommand({ FunctionName: def.name }));
    } catch {
      exists = false;
    }
    if (!exists) {
      await lambda.send(
        new CreateFunctionCommand({
          FunctionName: def.name,
          Runtime: "nodejs20.x",
          Role: "arn:aws:iam::000000000000:role/genu-exec",
          Handler: "index.handler",
          Code: { ZipFile: zip },
          Environment: { Variables: functionEnv },
          Timeout: 30,
        })
      );
      console.log("function created:", def.name);
    } else {
      // Code and configuration updates conflict while one is in
      // progress, so wait for each to settle before the next call.
      await lambda.send(
        new UpdateFunctionCodeCommand({ FunctionName: def.name, ZipFile: zip })
      );
      await waitSettled(def.name);
      await lambda.send(
        new UpdateFunctionConfigurationCommand({
          FunctionName: def.name,
          Environment: { Variables: functionEnv },
          Timeout: 30,
        })
      );
      console.log("function updated:", def.name);
    }
    arns[def.name] = await waitSettled(def.name);
  }
  return arns;
}

async function deployApi(apigw, lambda, arns) {
  const apis = await apigw.send(new GetApisCommand({}));
  const old = (apis.Items ?? []).find((a) => a.Name === "genu-api");
  if (old) {
    await apigw.send(new DeleteApiCommand({ ApiId: old.ApiId }));
    console.log("old api deleted:", old.ApiId);
  }
  const api = await apigw.send(
    new CreateApiCommand({ Name: "genu-api", ProtocolType: "HTTP" })
  );
  console.log("api created:", api.ApiId, api.ApiEndpoint);

  for (const def of FUNCTION_DEFS) {
    const integ = await apigw.send(
      new CreateIntegrationCommand({
        ApiId: api.ApiId,
        IntegrationType: "AWS_PROXY",
        IntegrationUri: arns[def.name],
        PayloadFormatVersion: "2.0",
      })
    );
    await apigw.send(
      new CreateRouteCommand({
        ApiId: api.ApiId,
        RouteKey: def.route,
        Target: `integrations/${integ.IntegrationId}`,
      })
    );
    try {
      await lambda.send(
        new AddPermissionCommand({
          FunctionName: def.name,
          StatementId: `apigw-${api.ApiId}`,
          Action: "lambda:InvokeFunction",
          Principal: "apigateway.amazonaws.com",
          SourceArn: `arn:aws:execute-api:${region}:000000000000:${api.ApiId}/*/*`,
        })
      );
    } catch (e) {
      if (e.name !== "ResourceConflictException") throw e;
    }
    console.log("route:", def.route, "->", def.name);
  }

  try {
    await apigw.send(
      new CreateStageCommand({
        ApiId: api.ApiId,
        StageName: "$default",
        AutoDeploy: true,
      })
    );
  } catch (e) {
    if (e.name !== "ConflictException") throw e;
    console.log("stage $default already exists");
  }
  return api.ApiEndpoint;
}

const ddb = new DynamoDBClient(clientConfig);
const cip = new CognitoIdentityProviderClient(clientConfig);
const lambda = new LambdaClient(clientConfig);
const apigw = new ApiGatewayV2Client(clientConfig);

await ensureTable(ddb);
const { poolId, clientId } = await ensureUserPool(cip);

const creds = readEmulatorCredentials();
const functionEnv = {
  TABLE_NAME,
  EMULATOR_CA_PEM: caPem ?? "",
  // Lambda reserves the AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY names,
  // so the emulator credentials travel under an EMULATOR_ prefix and the
  // functions pass them to the SDK explicitly (see functions/src/lib/aws.ts).
  EMULATOR_ACCESS_KEY_ID: creds.accessKeyId,
  EMULATOR_SECRET_ACCESS_KEY: creds.secretAccessKey,
  // The emulator runtime exposes a frozen globalThis.awslambda; the
  // SDK's invoke-store tries to assign to it and throws. This official
  // opt-out makes the SDK skip the global entirely.
  AWS_LAMBDA_NODEJS_NO_GLOBAL_AWSLAMBDA: "true",
  DEFAULT_MODEL_ID: "anthropic.claude-3-5-sonnet-20241022-v2:0",
};
const arns = await deployFunctions(lambda, functionEnv);
const apiEndpoint = await deployApi(apigw, lambda, arns);

const envLocal = [
  `VITE_API_URL=${apiEndpoint}`,
  `VITE_COGNITO_ENDPOINT=${endpoint}`,
  `VITE_USER_POOL_ID=${poolId}`,
  `VITE_USER_POOL_CLIENT_ID=${clientId}`,
  `VITE_AWS_REGION=${region}`,
  "",
].join("\n");
fs.writeFileSync(path.join(here, "frontend", ".env.local"), envLocal);

console.log("\n=== GenU-style stack deployed ===");
console.log("API endpoint:    ", apiEndpoint);
console.log("User pool id:    ", poolId);
console.log("User pool client:", clientId);
console.log("Demo user:       ", DEMO_EMAIL, "/", DEMO_PASSWORD);
console.log("frontend/.env.local written. Start the web app with:");
console.log("  cd frontend && npm install && npm run dev");
