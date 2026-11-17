// Bundles each Lambda handler in src/ into dist/<name>/index.js and
// creates dist/<name>.zip ready for CreateFunction / UpdateFunctionCode.
// The ZIP writer is a minimal stored (uncompressed) implementation so
// the build needs no external zip tool.
import * as esbuild from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const FUNCTIONS = [
  "create-chat",
  "list-chats",
  "get-chat",
  "delete-chat",
  "send-message",
];

// The emulator's Lambda runtime resolves most Node builtins (both
// bare and "node:" forms) but has NO module for: process, zlib, net,
// tls (verified by probing the runtime). Substitute local shims for
// those four so the bundled AWS SDK can be imported:
//   process -> the runtime's global process object
//   zlib / net / tls -> import-time stubs (unused on this app's paths)
const SHIMS = {
  process: "process-shim.js",
  zlib: "zlib-shim.js",
  net: "net-shim.js",
  tls: "tls-shim.js",
  http2: "universal-stub.js",
  child_process: "universal-stub.js",
};
const runtimeShims = {
  name: "runtime-shims",
  setup(build) {
    build.onResolve(
      { filter: /^(node:)?(process|zlib|net|tls|http2|child_process)$/ },
      (args) => {
        const name = args.path.replace(/^node:/, "");
        return { path: path.join(here, "src", "shims", SHIMS[name]) };
      }
    );
  },
};

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++)
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}
export function makeZip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content);
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

for (const name of FUNCTIONS) {
  const outDir = path.join(here, "dist", name);
  mkdirSync(outDir, { recursive: true });
  await esbuild.build({
    entryPoints: [path.join(here, "src", `${name}.ts`)],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile: path.join(outDir, "index.js"),
    plugins: [runtimeShims],
    // The emulator's Lambda runtime also lacks the web-streams globals
    // (TransformStream / ReadableStream / WritableStream) that some SDK
    // packages reference at import time. Define inert stand-ins; the
    // streaming paths that would use them are never exercised here.
    banner: {
      js: [
        'if (typeof globalThis.ReadableStream === "undefined") { globalThis.ReadableStream = class ReadableStream {}; }',
        'if (typeof globalThis.WritableStream === "undefined") { globalThis.WritableStream = class WritableStream {}; }',
        'if (typeof globalThis.TransformStream === "undefined") { globalThis.TransformStream = class TransformStream { constructor() { this.readable = new globalThis.ReadableStream(); this.writable = new globalThis.WritableStream(); } }; }',
      ].join("\n"),
    },
  });
  const zip = makeZip({ "index.js": readFileSync(path.join(outDir, "index.js")) });
  writeFileSync(path.join(here, "dist", `${name}.zip`), zip);
  console.log(`built dist/${name}.zip (${zip.length} bytes)`);
}
