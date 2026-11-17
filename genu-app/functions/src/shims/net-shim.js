// The emulator's Lambda runtime has no user-land "net" module (its
// http/https modules work internally). Bundled dependencies only use
// net's IP-classification helpers at import/request time; socket
// construction from user code is not needed by this app.
class Unavailable {
  constructor() {
    throw new Error("net sockets are not available in this runtime");
  }
}
module.exports = {
  isIP: () => 0,
  isIPv4: () => false,
  isIPv6: () => false,
  Socket: Unavailable,
  Server: Unavailable,
  createConnection: () => {
    throw new Error("net.createConnection is not available in this runtime");
  },
  createServer: () => {
    throw new Error("net.createServer is not available in this runtime");
  },
};
