import { defineConfig, devices } from "@playwright/test";

const authHeaders = {
  "oai-authenticated-user-id": "e2e-owner",
  "oai-authenticated-user-email": "e2e@example.com",
  "oai-authenticated-user-full-name": "E2E%20Owner",
  "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: { baseURL: "http://127.0.0.1:4173", extraHTTPHeaders: authHeaders, trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: { command: "npm run start:e2e", url: "http://127.0.0.1:4173/favicon.svg", reuseExistingServer: false, timeout: 120_000 },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
