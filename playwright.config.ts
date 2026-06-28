import { defineConfig, devices } from "@playwright/test";

const managedE2eServer = process.env.INKSPIRE_MANAGED_E2E_SERVER === "1";
const webPort = process.env.INKSPIRE_WEB_PORT || "5173";
const webUrl = `http://127.0.0.1:${webPort}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: {
    timeout: 10_000
  },
  use: {
    baseURL: webUrl,
    trace: "on-first-retry"
  },
  webServer: managedE2eServer ? undefined : {
    command: "node scripts/e2e-dev-server.cjs",
    env: {
      INKSPIRE_E2E: "1",
      INKSPIRE_DATA_DIR: ".e2e-data",
      PORT: "3101",
      INKSPIRE_API_TARGET: "http://127.0.0.1:3101"
    },
    url: webUrl,
    reuseExistingServer: false,
    timeout: 120_000
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] }
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] }
    }
  ]
});
