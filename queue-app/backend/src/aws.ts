import fs from "node:fs";
import https from "node:https";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import {
  SQSClient,
  CreateQueueCommand,
  GetQueueUrlCommand,
} from "@aws-sdk/client-sqs";

const endpoint = process.env.AWS_ENDPOINT_URL; // undefined => real AWS
const region = process.env.AWS_REGION ?? "us-east-1";

export const QUEUE_NAME = process.env.SQS_QUEUE ?? "tasks-queue";

// The emulator serves HTTPS with a certificate signed by its own CA
// (~/.aws/emulator/<port>/ca.pem). Trust that CA when a path is given.
function requestHandler() {
  const caPath = process.env.AWS_EMULATOR_CA_PATH;
  if (!endpoint || !caPath) return undefined;
  const ca = fs.readFileSync(caPath);
  return new NodeHttpHandler({ httpsAgent: new https.Agent({ ca }) });
}

export const sqs = new SQSClient({
  region,
  endpoint,
  requestHandler: requestHandler(),
});

let queueUrl: string | null = null;

export async function getQueueUrl(): Promise<string> {
  if (queueUrl) return queueUrl;
  try {
    const out = await sqs.send(
      new GetQueueUrlCommand({ QueueName: QUEUE_NAME })
    );
    queueUrl = out.QueueUrl ?? null;
  } catch {
    queueUrl = null;
  }
  if (!queueUrl) throw new Error(`queue not found: ${QUEUE_NAME}`);
  return queueUrl;
}

/** The emulator keeps everything in memory, so the queue is recreated
 *  on every start. Against real AWS this is a no-op when it exists. */
export async function ensureResources(): Promise<void> {
  try {
    await getQueueUrl();
    return;
  } catch {
    // fall through and create it
  }
  const out = await sqs.send(
    new CreateQueueCommand({
      QueueName: QUEUE_NAME,
      Attributes: { VisibilityTimeout: "30" },
    })
  );
  queueUrl = out.QueueUrl ?? null;
  console.log(`Created SQS queue "${QUEUE_NAME}"`);
}
