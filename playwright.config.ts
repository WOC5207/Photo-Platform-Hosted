import { defineConfig } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const adminStorageState = "e2e/.auth/admin.json";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "line",
  use: {
    baseURL,
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Keep the suite runnable with a system Chrome channel; video recording
    // needs Playwright's separate FFmpeg bundle and is not required for these
    // route, responsive-layout, and accessibility assertions.
    video: "off",
    locale: "en-CA",
    storageState:
      process.env.E2E_ADMIN_USERNAME || process.env.ADMIN_USERNAME
        ? adminStorageState
        : undefined
  },
  projects: [
    {
      name: "desktop-1280",
      use: { viewport: { width: 1280, height: 800 } }
    },
    {
      name: "tablet-768",
      use: { viewport: { width: 768, height: 900 } }
    },
    {
      name: "mobile-375",
      use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }
    },
    {
      name: "mobile-320",
      use: { viewport: { width: 320, height: 700 }, isMobile: true, hasTouch: true }
    }
  ],
  outputDir: "test-results"
});
