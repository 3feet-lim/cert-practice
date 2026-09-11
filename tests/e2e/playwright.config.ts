import { defineConfig, devices } from "@playwright/test";

const realApiEnabled = process.env.CERTQUIZ_REAL_E2E === "1";
const realApiWebUrl = process.env.CERTQUIZ_E2E_WEB_BASE_URL;

if (realApiEnabled && !realApiWebUrl) {
  throw new Error(
    "CERTQUIZ_REAL_E2E=1 requires CERTQUIZ_E2E_WEB_BASE_URL for the deployed web application.",
  );
}

const localWebUrl = "http://127.0.0.1:4173";
const baseURL = realApiEnabled ? realApiWebUrl! : localWebUrl;

export default defineConfig({
  testDir: "./specs",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "line" : [["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: "real-api-s1-s10.spec.ts",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "real-api",
      testMatch: "real-api-s1-s10.spec.ts",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  ...(realApiEnabled
    ? {}
    : {
        webServer: {
          command:
            "pnpm --filter @cert-quiz/web dev --host 127.0.0.1 --port 4173 --strictPort",
          url: localWebUrl,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }),
});
