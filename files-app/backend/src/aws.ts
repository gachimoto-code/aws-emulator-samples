import fs from "node:fs";
import https from "node:https";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";

const endpoint = process.env.AWS_ENDPOINT_URL; // undefined => real AWS
const region = process.env.AWS_REGION ?? "us-east-1";

export const BUCKET = process.env.S3_BUCKET ?? "files-app-storage";

// The emulator serves HTTPS with a certificate signed by its own CA
// (~/.aws/emulator/<port>/ca.pem). Trust that CA when a path is given.
function requestHandler() {
  const caPath = process.env.AWS_EMULATOR_CA_PATH;
  if (!endpoint || !caPath) return undefined;
  const ca = fs.readFileSync(caPath);
  return new NodeHttpHandler({ httpsAgent: new https.Agent({ ca }) });
}

export const s3 = new S3Client({
  region,
  endpoint,
  requestHandler: requestHandler(),
  // A single local endpoint cannot resolve <bucket>.127.0.0.1, so use
  // path-style addressing while talking to the emulator.
  forcePathStyle: Boolean(endpoint),
});

async function bucketExists(): Promise<boolean> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
    return true;
  } catch {
    return false;
  }
}

/** The emulator keeps everything in memory, so the bucket is recreated
 *  on every start. Against real AWS this is a no-op when it exists. */
export async function ensureResources(): Promise<void> {
  if (!(await bucketExists())) {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
    console.log(`Created S3 bucket "${BUCKET}"`);
  }
}
