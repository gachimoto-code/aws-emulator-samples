// See net-shim.js — same situation for "tls". The runtime's https
// module handles TLS internally; user-land tls is never used here.
module.exports = {
  connect: () => {
    throw new Error("tls.connect is not available in this runtime");
  },
  createServer: () => {
    throw new Error("tls.createServer is not available in this runtime");
  },
  checkServerIdentity: () => undefined,
  rootCertificates: [],
};
