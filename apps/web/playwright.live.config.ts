import { defineConfig } from "@playwright/test";

const liveBaseUrl = process.env.SELVEDGE_LIVE_URL;
if (liveBaseUrl === undefined || liveBaseUrl.length === 0) {
  throw new Error("Set SELVEDGE_LIVE_URL to the deployed dashboard origin to run the live checks.");
}

export default defineConfig({
  testDir: "./tests/live",
  timeout: 60_000,
  reporter: [["list"]],
  use: { baseURL: liveBaseUrl },
  projects: [
    { name: "mobile-360", use: { viewport: { width: 360, height: 740 } } },
    { name: "desktop-1280", use: { viewport: { width: 1280, height: 800 } } },
  ],
});
