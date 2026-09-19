import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/integration",
  timeout: 30_000,
  retries: 0,
  use: {
    headless: true,
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: {
    command:
      "npx serve tests/fixtures/pages -l 4173 --no-clipboard --no-request-logging",
    port: 4173,
    reuseExistingServer: true,
  },
});
