import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { chromium, expect, type FullConfig } from "@playwright/test";

const storageStatePath = "e2e/.auth/admin.json";

export default async function globalSetup(config: FullConfig) {
  const username = process.env.E2E_ADMIN_USERNAME ?? process.env.ADMIN_USERNAME;
  const password = process.env.E2E_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD;
  if (!username || !password) return;

  const baseURL = String(
    config.projects[0]?.use.baseURL ??
      process.env.PLAYWRIGHT_BASE_URL ??
      "http://127.0.0.1:3000"
  );
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome"
  });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${baseURL}/en/login`);
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/en\/dashboard(?:\/|$)/);
    await mkdir(dirname(storageStatePath), { recursive: true });
    await context.storageState({ path: storageStatePath });
  } finally {
    await browser.close();
  }
}
