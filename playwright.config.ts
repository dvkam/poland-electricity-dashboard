import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  outputDir: "../../work/browser-tests",
  timeout: 90_000,
  expect: { timeout: 60_000 },
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:5173",
    browserName: "chromium",
    channel: process.env["PLAYWRIGHT_CHANNEL"] === "chromium" ? undefined : "msedge",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  reporter: [["list"]],
});
