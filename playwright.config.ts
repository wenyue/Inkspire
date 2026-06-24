import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: {
    timeout: 10_000
  },
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry"
  },
  webServer: {
    command: "node -e \"process.env.INKSPIRE_E2E='1'; process.env.INKSPIRE_DATA_DIR='.e2e-data'; const win = process.platform === 'win32'; const cmd = win ? (process.env.ComSpec || 'cmd.exe') : 'npm'; const args = win ? ['/d', '/s', '/c', 'npm run dev'] : ['run', 'dev']; require('node:child_process').spawn(cmd, args, { stdio: 'inherit', env: process.env });\"",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: false,
    timeout: 120_000
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
