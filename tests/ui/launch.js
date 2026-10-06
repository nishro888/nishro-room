// Starts the UI tests in Electron. VS Code's terminals set
// ELECTRON_RUN_AS_NODE=1, which makes Electron run as plain Node - so it is
// removed for the child.   npm run test:ui
const { spawnSync } = require("child_process");
const path = require("path");
const electron = require("electron");   // under Node: the path to the binary

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const r = spawnSync(electron, [path.join(__dirname, "run.js")], { stdio: "inherit", env });
process.exit(r.status === null ? 1 : r.status);
