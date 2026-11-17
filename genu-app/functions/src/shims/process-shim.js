// The emulator's Lambda runtime has a global `process` but no
// "process" module. Re-export the global for bundled dependencies.
module.exports = globalThis.process;
