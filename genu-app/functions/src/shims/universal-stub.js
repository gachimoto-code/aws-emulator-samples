// Universal import-time stub for Node builtins the emulator's Lambda
// runtime does not provide (http2, child_process, ...). Any property
// access returns the same callable proxy, so destructuring imports in
// bundled dependencies succeed. Actually invoking these APIs would not
// work — this app's code paths (DynamoDB / Bedrock JSON over HTTPS,
// with explicit credentials) never call them.
const stub = new Proxy(function () {}, {
  get(_target, prop) {
    if (prop === "__esModule") return false;
    if (prop === Symbol.toPrimitive) return () => "";
    return stub;
  },
  apply() {
    return stub;
  },
  construct() {
    return {};
  },
});
module.exports = stub;
module.exports.default = stub;
