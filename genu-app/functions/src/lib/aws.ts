import https from "node:https";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";

// How the functions reach AWS services on the emulator (verified by
// probing the runtime):
// - Do NOT set a custom endpoint. The emulator's Lambda runtime
//   intercepts HTTPS requests and dispatches them by the AWS service
//   hostname, so the SDKs' default endpoints
//   (https://dynamodb.<region>.amazonaws.com, https://bedrock-runtime...)
//   are routed to the emulator automatically. Pointing the SDK at the
//   emulator's own endpoint (127.0.0.1:9297) fails from inside a
//   function with "addresses no service this emulator serves".
// - The runtime carries no credentials of its own, and the standard
//   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY environment names are
//   reserved keys Lambda refuses to set. The deploy script therefore
//   injects the emulator's own credentials under an EMULATOR_ prefix
//   and they are passed to the SDK explicitly here.
// - EMULATOR_CA_PEM carries the emulator CA certificate (PEM text).
const region = process.env.AWS_REGION ?? "us-east-1";

function requestHandler() {
  const ca = process.env.EMULATOR_CA_PEM;
  if (!ca) return undefined;
  return new NodeHttpHandler({ httpsAgent: new https.Agent({ ca }) });
}

const credentials =
  process.env.EMULATOR_ACCESS_KEY_ID && process.env.EMULATOR_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.EMULATOR_ACCESS_KEY_ID,
        secretAccessKey: process.env.EMULATOR_SECRET_ACCESS_KEY,
      }
    : undefined;

const config = { region, credentials, requestHandler: requestHandler() };

export const ddb = DynamoDBDocumentClient.from(new DynamoDBClient(config));
export const bedrock = new BedrockRuntimeClient(config);
export const TABLE_NAME = process.env.TABLE_NAME ?? "GenUChats";
export const DEFAULT_MODEL_ID =
  process.env.DEFAULT_MODEL_ID ?? "anthropic.claude-3-5-sonnet-20241022-v2:0";
