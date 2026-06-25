const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const env = {
  ...process.env,
  INKSPIRE_E2E: "1",
  INKSPIRE_DATA_DIR: ".e2e-data",
  PORT: "3101",
  INKSPIRE_API_TARGET: "http://127.0.0.1:3101",
  INKSPIRE_MANAGED_E2E_SERVER: "1"
};

function waitForUrl(url, label = url, timeoutMs = 120000, isReady = (status) => status >= 200 && status < 300) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const request = http.get(url, (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          if (response.statusCode && isReady(response.statusCode, body)) {
            resolve();
            return;
          }
          if (Date.now() - started > timeoutMs) {
            reject(new Error(`${label} failed with HTTP ${response.statusCode}: ${body.slice(0, 200)}`));
            return;
          }
          setTimeout(check, 500);
        });
      });
      request.on("error", (error) => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`${label} failed: ${error.message}`));
          return;
        }
        setTimeout(check, 500);
      });
      request.setTimeout(5000, () => {
        request.destroy();
      });
    };
    check();
  });
}

function spawnChild(command, args, options = {}) {
  return spawn(command, args, {
    cwd: root,
    env,
    stdio: "inherit",
    ...options
  });
}

function waitForClose(child, timeoutMs = 10000) {
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

async function main() {
  const server = spawnChild(process.execPath, ["scripts/e2e-dev-server.cjs"]);
  let finished = false;

  const stopServer = async () => {
    if (!server.killed) {
      server.kill();
    }
    await waitForClose(server);
  };

  process.on("SIGINT", async () => {
    await stopServer();
    process.exit(130);
  });
  process.on("SIGTERM", async () => {
    await stopServer();
    process.exit(143);
  });

  server.on("exit", (code) => {
    if (!finished) {
      process.exit(code ?? 1);
    }
  });

  try {
    await Promise.all([
      waitForUrl("http://127.0.0.1:5173", "Vite dev server"),
      waitForUrl("http://127.0.0.1:3101/api/health", "API health", 120000, (status, body) => {
        if (status < 200 || status >= 300) {
          return false;
        }
        try {
          return JSON.parse(body).ok === true;
        } catch {
          return false;
        }
      })
    ]);

    const playwright = spawnChild(process.execPath, [
      path.join(root, "node_modules/@playwright/test/cli.js"),
      "test",
      ...process.argv.slice(2)
    ]);

    const code = await new Promise((resolve) => {
      playwright.on("exit", resolve);
    });
    finished = true;
    await stopServer();
    process.exit(code ?? 0);
  } catch (error) {
    finished = true;
    await stopServer();
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
