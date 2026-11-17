import fs from "node:fs";
import https from "node:https";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";

const endpoint = process.env.AWS_ENDPOINT_URL; // undefined => real AWS
const region = process.env.AWS_REGION ?? "us-east-1";

export const TABLE = process.env.DYNAMODB_TABLE ?? "Notes";
export const BUCKET = process.env.S3_BUCKET ?? "notes-attachments";

// The emulator serves HTTPS with a certificate signed by its own CA
// (~/.aws/emulator/<port>/ca.pem). Trust that CA when a path is given.
function requestHandler() {
  const caPath = process.env.AWS_EMULATOR_CA_PATH;
  if (!endpoint || !caPath) return undefined;
  const ca = fs.readFileSync(caPath);
  return new NodeHttpHandler({ httpsAgent: new https.Agent({ ca }) });
}

const handler = requestHandler();

export const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region, endpoint, requestHandler: handler }),
  { marshallOptions: { removeUndefinedValues: true } }
);

export const s3 = new S3Client({
  region,
  endpoint,
  requestHandler: handler,
  // A single local endpoint cannot resolve <bucket>.127.0.0.1, so use
  // path-style addressing while talking to the emulator.
  forcePathStyle: Boolean(endpoint),
});

async function tableExists(): Promise<boolean> {
  try {
    await ddb.send(new DescribeTableCommand({ TableName: TABLE }));
    return true;
  } catch {
    return false;
  }
}

async function bucketExists(): Promise<boolean> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
    return true;
  } catch {
    return false;
  }
}

/** The emulator keeps everything in memory, so resources are recreated
 *  on every start. Against real AWS this is a no-op when they exist. */
export async function ensureResources(): Promise<void> {
  if (!(await tableExists())) {
    await ddb.send(
      new CreateTableCommand({
        TableName: TABLE,
        BillingMode: "PAY_PER_REQUEST",
        AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
        KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      })
    );
    console.log(`Created DynamoDB table "${TABLE}"`);
  }
  if (!(await bucketExists())) {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
    console.log(`Created S3 bucket "${BUCKET}"`);
  }
}
