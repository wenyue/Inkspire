import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiTarget = (globalThis as { process?: { env?: Record<string, string | undefined> } })
  .process?.env?.INKSPIRE_API_TARGET;

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": apiTarget || "http://127.0.0.1:3001"
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: "./vitest.setup.ts"
  }
});
