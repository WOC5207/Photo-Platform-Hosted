import { defineConfig } from "@playwright/test";

const allowMutations = process.env.E2E_ALLOW_MUTATIONS === "1";
const e2eDatabaseUrl = process.env.E2E_DATABASE_URL?.trim();
const baseURL = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000").trim();
const mutationAppOrigin = "http://127.0.0.1:3001";

if (allowMutations) {
  if (!e2eDatabaseUrl) {
    throw new Error(
      "E2E_ALLOW_MUTATIONS=1 requires E2E_DATABASE_URL. Point it at the disposable E2E database, never a production database."
    );
  }

  let appUrl: URL;
  let databaseUrl: URL;
  try {
    appUrl = new URL(baseURL);
    databaseUrl = new URL(e2eDatabaseUrl);
  } catch {
    throw new Error(
      "Mutation-enabled E2E requires valid PLAYWRIGHT_BASE_URL and E2E_DATABASE_URL values."
    );
  }

  if (
    appUrl.origin !== mutationAppOrigin ||
    appUrl.pathname !== "/" ||
    appUrl.search ||
    appUrl.hash ||
    appUrl.username ||
    appUrl.password
  ) {
    throw new Error(
      `E2E_ALLOW_MUTATIONS=1 may only target ${mutationAppOrigin}. Start docker-compose.e2e.yml and use its loopback-only app port.`
    );
  }

  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\/+/, ""));
  const loopbackDatabaseHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);
  if (
    !["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
    !loopbackDatabaseHosts.has(databaseUrl.hostname) ||
    databaseName !== "photo_e2e"
  ) {
    throw new Error(
      "E2E_DATABASE_URL must use PostgreSQL on a loopback host and the dedicated photo_e2e database."
    );
  }

  // Fixtures import the shared Prisma client, so select the disposable test
  // database while configuration is loading and before test modules execute.
  process.env.DATABASE_URL = e2eDatabaseUrl;
}

const adminStorageState = "e2e/.auth/admin.json";
const desktopOnlyTag = /@desktop-only/;

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
      grepInvert: desktopOnlyTag,
      use: { viewport: { width: 768, height: 900 } }
    },
    {
      name: "mobile-375",
      grepInvert: desktopOnlyTag,
      use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }
    },
    {
      name: "mobile-320",
      grepInvert: desktopOnlyTag,
      use: { viewport: { width: 320, height: 700 }, isMobile: true, hasTouch: true }
    }
  ],
  outputDir: "test-results"
});
