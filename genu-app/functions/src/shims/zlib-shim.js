// The emulator's Lambda runtime has no "zlib" module. Some bundled
// dependencies require it at import time even on code paths that never
// compress anything (the DynamoDB / Bedrock JSON protocols used here).
// This stub satisfies the import; calling it throws, which would only
// happen on a compression path this app does not use.
function unavailable(name) {
  return function () {
    throw new Error(`zlib.${name} is not available in this runtime`);
  };
}
module.exports = {
  gzip: unavailable("gzip"),
  gzipSync: unavailable("gzipSync"),
  gunzip: unavailable("gunzip"),
  gunzipSync: unavailable("gunzipSync"),
  inflate: unavailable("inflate"),
  inflateSync: unavailable("inflateSync"),
  deflate: unavailable("deflate"),
  deflateSync: unavailable("deflateSync"),
  createGzip: unavailable("createGzip"),
  createGunzip: unavailable("createGunzip"),
  createInflate: unavailable("createInflate"),
  createDeflate: unavailable("createDeflate"),
  constants: {},
};
