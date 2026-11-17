require("dotenv/config");
const fs = require("node:fs");
const https = require("node:https");
const { NodeHttpHandler } = require("@smithy/node-http-handler");

// Shared client configuration for the check scripts. Point the AWS SDK
// at the emulator endpoint from .env; the emulator's own CA is trusted
// when AWS_EMULATOR_CA_PATH is set.
const endpoint = process.env.AWS_ENDPOINT_URL; // undefined => real AWS
const region = process.env.AWS_REGION ?? "us-east-1";

function requestHandler() {
  const caPath = process.env.AWS_EMULATOR_CA_PATH;
  if (!endpoint || !caPath) return undefined;
  const ca = fs.readFileSync(caPath);
  return new NodeHttpHandler({ httpsAgent: new https.Agent({ ca }) });
}

module.exports = {
  clientConfig: { region, endpoint, requestHandler: requestHandler() },
};
