import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { chromium, expect, type FullConfig } from "@playwright/test";

const storageStatePath = "e2e/.auth/admin.json";

async function verifyMutationTarget(baseURL: string): Promise<void> {
  if (process.env.E2E_ALLOW_MUTATIONS !== "1") return;

  // A loopback port alone cannot prove which app is listening there. Insert a
  // one-time marker into the disposable runner database, then require the
  // browser target to render that exact marker. This binds browser mutations
  // and direct Prisma fixtures to the same database without adding a
  // test-only endpoint to production code.
  const { prisma } = await import("../src/lib/db");
  const nonce = randomUUID().replace(/-/g, "");
  const username = `e2e-probe-${nonce.slice(0, 20)}`;
  const marker = `e2e-target-${nonce}`;
  let probeUserId: string | null = null;

  try {
    const probe = await prisma.user.create({
      data: {
        username,
        passwordHash: marker,
        role: "user",
        status: "active",
        displayName: marker,
        settings: {
          create: {
            siteTitleEn: marker,
            homeTitleEn: marker
          }
        }
      },
      select: { id: true }
    });
    probeUserId = probe.id;

    const response = await fetch(new URL(`/en/u/${username}`, baseURL), {
      headers: { "cache-control": "no-store" },
      redirect: "manual"
    });
    const body = await response.text();
    if (!response.ok || !body.includes(marker)) {
      throw new Error(
        `Mutation safety check failed: ${baseURL} did not render the one-time marker from E2E_DATABASE_URL. Refusing to run mutating browser workflows.`
      );
    }
  } finally {
    if (probeUserId) {
      await prisma.user.deleteMany({ where: { id: probeUserId } });
    }
  }
}

export default async function globalSetup(config: FullConfig) {
  const username = process.env.E2E_ADMIN_USERNAME ?? process.env.ADMIN_USERNAME;
  const password = process.env.E2E_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD;
  const baseURL = String(
    config.projects[0]?.use.baseURL ??
      process.env.PLAYWRIGHT_BASE_URL ??
      "http://127.0.0.1:3000"
  );
  await verifyMutationTarget(baseURL);
  if (!username || !password) return;

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
