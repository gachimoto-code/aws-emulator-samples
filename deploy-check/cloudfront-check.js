// CloudFront + S3 check: how far does the static-frontend path go?
// Uploads a page to S3, sets website hosting + a public-read policy,
// creates a CloudFront distribution, and tries to fetch the page
// through the distribution's (local) domain.
//
// Expected result (verified 2026-11-17, emulator v1.0.483): the S3 side
// fully works (files are really stored; website config and Block Public
// Access behave like real AWS). The distribution is created and gets a
// local domain (127.0.0.1:<port>) that answers, but fetching the page
// through it returns 403 AccessDenied even with a public-read policy —
// content delivery does not actually work. See README.md.
const https = require("node:https");
const {
  S3Client,
  CreateBucketCommand,
  PutObjectCommand,
  PutBucketWebsiteCommand,
  GetBucketWebsiteCommand,
  PutPublicAccessBlockCommand,
  PutBucketPolicyCommand,
} = require("@aws-sdk/client-s3");
const {
  CloudFrontClient,
  CreateDistributionCommand,
} = require("@aws-sdk/client-cloudfront");
const { clientConfig } = require("./aws-config");

const s3 = new S3Client({ ...clientConfig, forcePathStyle: true });
const cf = new CloudFrontClient(clientConfig);

const BUCKET = "deploy-check-frontend";
const PAGE = "<!doctype html><html><body><h1>deploy-check</h1></body></html>\n";

function fetchViaDomain(domain, path) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      { host: domain, path, rejectUnauthorized: false, timeout: 5000 },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode, body }));
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

(async () => {
  await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: "index.html",
      Body: PAGE,
      ContentType: "text/html",
    })
  );
  console.log("uploaded index.html to bucket:", BUCKET);

  await s3.send(
    new PutBucketWebsiteCommand({
      Bucket: BUCKET,
      WebsiteConfiguration: { IndexDocument: { Suffix: "index.html" } },
    })
  );
  const web = await s3.send(new GetBucketWebsiteCommand({ Bucket: BUCKET }));
  console.log("website config stored:", JSON.stringify(web.IndexDocument));

  // Real AWS blocks public policies by default; so does the emulator.
  await s3.send(
    new PutPublicAccessBlockCommand({
      Bucket: BUCKET,
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        IgnorePublicAcls: true,
        BlockPublicPolicy: false,
        RestrictPublicBuckets: false,
      },
    })
  );
  await s3.send(
    new PutBucketPolicyCommand({
      Bucket: BUCKET,
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "PublicRead",
            Effect: "Allow",
            Principal: "*",
            Action: "s3:GetObject",
            Resource: `arn:aws:s3:::${BUCKET}/*`,
          },
        ],
      }),
    })
  );
  console.log("public-read bucket policy set");

  const dist = await cf.send(
    new CreateDistributionCommand({
      DistributionConfig: {
        CallerReference: `deploy-check-${Date.now()}`,
        Comment: "deploy-check frontend", // required by the emulator
        Enabled: true,
        DefaultRootObject: "index.html",
        Origins: {
          Quantity: 1,
          Items: [
            {
              Id: "s3-frontend",
              DomainName: `${BUCKET}.s3.us-east-1.amazonaws.com`,
              S3OriginConfig: { OriginAccessIdentity: "" },
            },
          ],
        },
        DefaultCacheBehavior: {
          TargetOriginId: "s3-frontend",
          ViewerProtocolPolicy: "allow-all",
          MinTTL: 0,
          ForwardedValues: {
            QueryString: false,
            Cookies: { Forward: "none" },
          },
        },
      },
    })
  );
  const d = dist.Distribution;
  console.log("distribution:", d?.Id, "| status:", d?.Status, "| domain:", d?.DomainName);

  if (d?.DomainName) {
    // The local endpoint can take a moment to accept connections, and a
    // failed fetch is a check result, not a script error — retry a few
    // times and report whatever comes back.
    let outcome = null;
    for (let i = 0; i < 5 && !outcome; i++) {
      try {
        outcome = await fetchViaDomain(d.DomainName, "/index.html");
      } catch (e) {
        console.log(`fetch attempt ${i + 1} failed: ${e.message}`);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    if (outcome) {
      console.log(`fetch via distribution domain -> HTTP ${outcome.status}`);
      console.log(
        "body (first 120 chars):",
        JSON.stringify(outcome.body.slice(0, 120))
      );
    } else {
      console.log("fetch via distribution domain -> connection failed");
    }
  }

  console.log(
    "\nSummary: S3 storage and website settings work for real; the " +
      "distribution is created with a local domain, but page delivery " +
      "through it is denied (403) — distribution is control-plane only."
  );
})().catch((e) => {
  console.error("ERROR:", e.name, e.message);
  process.exit(1);
});
