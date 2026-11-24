import { defineConfig } from "@playwright/test";

const WEB_PORT = 3100;
const FIXTURE_RPC_URL = "http://127.0.0.1:8899";
const SERVER_START_TIMEOUT_MILLISECONDS = 120_000;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://127.0.0.1:${WEB_PORT}`, trace: "retain-on-failure", reducedMotion: "reduce" },
  projects: [
    { name: "mobile-360", use: { viewport: { width: 360, height: 740 } } },
    { name: "desktop-1280", use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: [
    {
      command: "pnpm exec tsx tests/fixtures/rpcServer.ts",
      url: `${FIXTURE_RPC_URL}/containment`,
      reuseExistingServer: false,
      timeout: SERVER_START_TIMEOUT_MILLISECONDS,
    },
    {
      command: `pnpm exec next start -p ${WEB_PORT}`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: SERVER_START_TIMEOUT_MILLISECONDS,
      env: { SOLANA_RPC_URL: FIXTURE_RPC_URL, SELVEDGE_RUNTIME_URL: FIXTURE_RPC_URL },
    },
  ],
});
