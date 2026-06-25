const { spawn } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const env = {
  ...process.env,
  INKSPIRE_E2E: process.env.INKSPIRE_E2E || "1",
  INKSPIRE_DATA_DIR: process.env.INKSPIRE_DATA_DIR || ".e2e-data",
  PORT: process.env.PORT || "3101",
  INKSPIRE_API_TARGET: process.env.INKSPIRE_API_TARGET || "http://127.0.0.1:3101"
};

const children = [
  spawn(process.execPath, ["server/src/index.js"], {
    cwd: root,
    env,
    stdio: "inherit"
  }),
  spawn(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "--host", "0.0.0.0"], {
    cwd: path.join(root, "client"),
    env,
    stdio: "inherit"
  })
];

let shuttingDown = false;

function waitForClose(child, timeoutMs = 5000) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    child.once("close", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function shutdown(code = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }
  await Promise.all(children.map((child) => waitForClose(child)));
  process.exit(code);
}

for (const child of children) {
  child.on("exit", (code, signal) => {
    if (!shuttingDown) {
      shutdown(code ?? (signal ? 1 : 0));
    }
  });
}

process.on("SIGINT", () => {
  void shutdown(0);
});
process.on("SIGTERM", () => {
  void shutdown(0);
});
