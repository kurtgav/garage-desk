import { randomBytes } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";

const externalBaseUrl = process.env.E2E_BASE_URL;
const baseURL = externalBaseUrl ?? "http://localhost:3000";
const isCI = !!process.env.CI;
// A local `next dev` is one process that every run on this machine shares (overlapping runs, D-096).
const localDev = !isCI && !externalBaseUrl;
// One id per run, inherited by global setup and the workers: per-run e2e accounts and auth files (D-096).
process.env.E2E_RUN_ID ||= randomBytes(4).toString("hex");

export default defineConfig({
  testDir: "e2e",
  // Creates this run's e2e staff and saves one storageState per role (e2e/.auth/<runId>/, gitignored); its return
  // value is the teardown, which removes them again.
  globalSetup: "./e2e/global-setup.ts",
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  // Locally: fewer workers and more time, so two overlapping runs fit one dev server (`--workers` overrides).
  workers: localDev ? 3 : undefined,
  timeout: localDev ? 60_000 : 30_000,
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : "list",
  // A local `next dev` compiles routes on first hit; global setup warms the main ones, this covers the rest.
  expect: { timeout: localDev ? 10_000 : 5_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile-375",
      use: {
        browserName: "chromium",
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      },
    },
  ],
  // E2E_BASE_URL targets an already running deployment (e.g. production); otherwise start the dev server.
  webServer: externalBaseUrl
    ? undefined
    : { command: "pnpm dev", url: baseURL, reuseExistingServer: !isCI, timeout: 180_000 },
});
