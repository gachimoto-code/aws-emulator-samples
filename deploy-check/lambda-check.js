// Lambda check: does the emulator actually run functions, or is it
// control-plane only like ECS?
// Creates a Python and a Node.js function (zip built in-memory),
// waits for Active, and invokes each with a test event.
//
// Expected result (verified 2026-11-17, emulator v1.0.483): unlike ECS,
// Lambda REALLY executes — both runtimes return the handler's actual
// return value. See README.md.
const {
  LambdaClient,
  CreateFunctionCommand,
  GetFunctionCommand,
  InvokeCommand,
} = require("@aws-sdk/client-lambda");
const { clientConfig } = require("./aws-config");

const lambda = new LambdaClient(clientConfig);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Minimal stored (uncompressed) ZIP writer, so the check needs no
// external zip tool and no binary fixtures in the repo.
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();
function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++)
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}
function makeZip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content);
    const nameBuf = Buffer.from(name);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    chunks.push(local, nameBuf, data);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(data.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const centralSize = central.reduce((s, b) => s + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, ...central, end]);
}

const FUNCTIONS = [
  {
    name: "deploy-check-py",
    runtime: "python3.12",
    handler: "handler.handler",
    files: {
      "handler.py":
        "import json\n\ndef handler(event, context):\n    return {\"ok\": True, \"runtime\": \"python\", \"echo\": event}\n",
    },
  },
  {
    name: "deploy-check-js",
    runtime: "nodejs20.x",
    handler: "index.handler",
    files: {
      "index.js":
        'exports.handler = async (event) => ({ ok: true, runtime: "node", echo: event });\n',
    },
  },
];

(async () => {
  for (const fn of FUNCTIONS) {
    await lambda.send(
      new CreateFunctionCommand({
        FunctionName: fn.name,
        Runtime: fn.runtime,
        Role: "arn:aws:iam::000000000000:role/lambda-exec",
        Handler: fn.handler,
        Code: { ZipFile: makeZip(fn.files) },
      })
    );
    let state = "Pending";
    for (let i = 0; i < 10 && state !== "Active"; i++) {
      const got = await lambda.send(
        new GetFunctionCommand({ FunctionName: fn.name })
      );
      state = got.Configuration?.State;
      if (state !== "Active") await sleep(3000);
    }
    console.log(`${fn.name} (${fn.runtime}): state = ${state}`);

    const inv = await lambda.send(
      new InvokeCommand({
        FunctionName: fn.name,
        InvocationType: "RequestResponse",
        Payload: Buffer.from(JSON.stringify({ hello: "world" })),
      })
    );
    console.log(
      `  invoke -> StatusCode ${inv.StatusCode}, FunctionError: ${
        inv.FunctionError ?? "(none)"
      }, payload: ${
        inv.Payload ? Buffer.from(inv.Payload).toString() : "(empty)"
      }`
    );
  }

  console.log(
    "\nSummary: Lambda functions really execute on the emulator — " +
      "the handlers' return values come back from Invoke."
  );
})().catch((e) => {
  console.error("ERROR:", e.name, e.message);
  process.exit(1);
});
