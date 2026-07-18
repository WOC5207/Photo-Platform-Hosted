import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "crypto";
import { sealData } from "iron-session";
import { prisma } from "@/lib/db";

const adminUsername = process.env.E2E_ADMIN_USERNAME ?? process.env.ADMIN_USERNAME;
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD;
const userUsername = process.env.E2E_USER_USERNAME;
const userPassword = process.env.E2E_USER_PASSWORD;
const sessionSecret = process.env.E2E_SESSION_SECRET ?? process.env.SESSION_SECRET;
const allowMutations = process.env.E2E_ALLOW_MUTATIONS === "1";

async function signIn(page: Page, username: string, password: string) {
  await page.goto("/en/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/(dashboard|admin)(?:\/|$)/);
}

async function openAdminDashboard(page: Page) {
  await page.goto("/en/dashboard");
  if (new URL(page.url()).pathname.endsWith("/login")) {
    await signIn(page, adminUsername!, adminPassword!);
  }
}

async function expectNoSeriousAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const serious = results.violations.filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious"
  );
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}

test.describe("role-aware management shell", () => {
  test.skip(!adminUsername || !adminPassword, "Set E2E_ADMIN_USERNAME and E2E_ADMIN_PASSWORD.");

  test("administrator can switch workspaces and sees route-aware navigation", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1280", "Desktop navigation assertion.");
    await openAdminDashboard(page);
    await expect(page.getByRole("link", { name: "Overview", exact: true })).toHaveAttribute(
      "aria-current",
      "page"
    );
    await expect(page.getByRole("link", { name: "My storage", exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Platform admin", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/admin$/);
    await expect(page.getByRole("link", { name: "Accounts", exact: true })).toHaveAttribute(
      "aria-current",
      "page"
    );
    await expect(page.getByRole("link", { name: "Storage plans", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Platform health", exact: true })).toBeVisible();
    await expectNoSeriousAccessibilityViolations(page);
  });

  test("mobile shell uses a drawer and profile menu", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "desktop-1280", "Compact-shell assertion.");
    await openAdminDashboard(page);
    await page.getByRole("button", { name: "Menu" }).click();
    const drawer = page.getByRole("dialog", { name: "Menu" });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("link", { name: "Gallery events" })).toBeVisible();
    await drawer.getByRole("button", { name: "Close" }).click();

    await page.getByRole("button", { name: "Account" }).click();
    const profileMenu = page.getByRole("dialog", { name: "Account" });
    await expect(profileMenu.getByRole("link", { name: "View site" })).toBeVisible();
    await expect(profileMenu.getByText("Language", { exact: true })).toBeVisible();
    await expect(profileMenu.getByRole("button", { name: "Log out" })).toBeVisible();

    await page.goto("/en/admin");
    await expect(page.locator("main table")).toBeHidden();
    await expect(page.locator("main ul > li").first()).toBeVisible();
  });

  test("regular user sees only their site workspace", async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1280", "Desktop role assertion.");
    if (userUsername && userPassword) {
      await context.clearCookies();
      await signIn(page, userUsername, userPassword);
    } else {
      test.skip(!sessionSecret, "Set user credentials or E2E_SESSION_SECRET for a read-only session fixture.");
      await openAdminDashboard(page);
      await page.goto("/en/admin");
      const accountLinks = page.locator('main a[href*="/admin/accounts/"]');
      const accountHrefs = Array.from(
        new Set((await accountLinks.evaluateAll((links) => links.map((link) => link.getAttribute("href")))).filter(Boolean))
      );
      test.skip(accountHrefs.length < 2, "A regular-user account fixture is required.");
      const href = accountHrefs[1];
      const userId = href?.split("/").pop();
      test.skip(!userId, "Could not resolve a regular-user account fixture.");
      const session = await sealData(
        { userId },
        { password: sessionSecret!, ttl: 60 * 60 }
      );
      const origin = new URL(page.url()).origin;
      await context.clearCookies();
      await context.addCookies([
        {
          name: "session",
          value: session,
          url: origin,
          httpOnly: true,
          sameSite: "Lax"
        }
      ]);
      await page.goto("/en/dashboard");
      await expect(page).toHaveURL(/\/en\/dashboard$/);
    }
    await expect(page.getByRole("link", { name: "Overview", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Platform admin", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "My storage", exact: true })).toBeVisible();
  });
});

test.describe("locale and theme compatibility", () => {
  test.skip(!adminUsername || !adminPassword, "Set E2E_ADMIN_USERNAME and E2E_ADMIN_PASSWORD.");

  test("English and Chinese settings render in light and dark themes", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1280", "Run the locale/theme matrix once.");
    await openAdminDashboard(page);
    for (const theme of ["light", "dark"] as const) {
      await page.evaluate((value) => localStorage.setItem("theme", value), theme);
      await page.goto("/en/dashboard/settings?section=appearance");
      await expect(page.locator("html")).toHaveClass(new RegExp(theme));
      await expect(page.getByRole("heading", { name: "Site settings" })).toBeVisible();

      await page.goto("/zh/dashboard/settings?section=appearance");
      await expect(page.locator("html")).toHaveClass(new RegExp(theme));
      await expect(page.getByRole("heading", { name: "网站设置" })).toBeVisible();
    }
  });
});

test.describe.serial("management workflows", () => {
  test.skip(!adminUsername || !adminPassword, "Set E2E_ADMIN_USERNAME and E2E_ADMIN_PASSWORD.");
  test.skip(!allowMutations, "Set E2E_ALLOW_MUTATIONS=1 and use a disposable database.");

  test.beforeEach(async ({ page }) => {
    await openAdminDashboard(page);
  });

  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1280", "Mutating workflows run once.");
  });

  test("settings section saves and profile display name remains editable", async ({ page }) => {
    await page.goto("/en/dashboard/settings?section=appearance");
    const title = page.getByLabel("Site title (English)");
    const originalTitle = await title.inputValue();
    const temporaryTitle = `E2E ${Date.now()}`;
    await title.fill(temporaryTitle);
    await expect(page.getByText("Unsaved changes")).toBeVisible();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
    await expect(page).toHaveTitle(temporaryTitle);
    await title.fill(originalTitle);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page).toHaveTitle(
      originalTitle || "Pinhaoshe Photographer Platform"
    );

    await page.getByRole("link", { name: "Profile & security" }).click();
    await expect(page).toHaveURL(/section=profile/);
    await expect(page.getByLabel("Username")).toHaveAttribute("readonly", "");
    const displayName = page.getByLabel("Display name");
    const originalDisplayName = await displayName.inputValue();
    await displayName.fill(`${originalDisplayName || adminUsername} E2E`);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
    await displayName.fill(originalDisplayName);
    await page.getByRole("button", { name: "Save", exact: true }).click();
  });

  test("disabled booking feature stays manageable and is clearly marked", async ({ page }) => {
    await page.goto("/en/dashboard/settings?section=features");
    const booking = page.getByRole("checkbox", { name: "Event booking" });
    const originallyEnabled = await booking.isChecked();
    if (!originallyEnabled) {
      await booking.check();
      await page.getByRole("button", { name: "Save", exact: true }).click();
    }
    await booking.uncheck();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.goto("/en/dashboard/bookings");
    await expect(page.getByRole("status")).toContainText("Off hides the Booking nav link");
    await expect(page.getByRole("link", { name: "Bookings", exact: true })).toBeVisible();

    if (originallyEnabled) {
      await page.goto("/en/dashboard/settings?section=features");
      await page.getByRole("checkbox", { name: "Event booking" }).check();
      await page.getByRole("button", { name: "Save", exact: true }).click();
    }
  });

  test("published album preview uses the owner gallery route", async ({ page }) => {
    const slug = `e2e-preview-${Date.now()}`;
    await page.goto("/en/dashboard/events/new");
    await page.getByLabel("Title (English)").fill("E2E preview album");
    await page.getByLabel("URL slug").fill(slug);
    await page.getByRole("checkbox", { name: /Published/ }).check();
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page.waitForURL(/\/dashboard\/events\/(?!new$)[^/]+$/);
    const editUrl = page.url();
    const preview = page.getByRole("link", { name: "View public page" });
    await expect(preview).toHaveAttribute("href", new RegExp(`/u/[^/]+/gallery/${slug}$`));
    await preview.click();
    await expect(page).toHaveURL(new RegExp(`/en/u/[^/]+/gallery/${slug}$`));

    await page.goto(editUrl);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete event" }).click();
    await expect(page).toHaveURL(/\/en\/dashboard\/events$/);
  });

  test("registration notice delays a usable invite before showing the account form", async ({
    page,
    browser
  }) => {
    await page.goto("/en/admin/invites");

    const enabled = page.getByRole("checkbox", {
      name: "Show this notice before registration"
    });
    const delay = page.getByLabel("Continue delay (seconds)");
    const titleEn = page.getByLabel("Notice title (English)");
    const titleZh = page.getByLabel("Notice title (Chinese)");
    const bodyEn = page.getByLabel("Notice or EULA (English)");
    const bodyZh = page.getByLabel("Notice or EULA (Chinese)");
    const original = {
      enabled: await enabled.isChecked(),
      delay: await delay.inputValue(),
      titleEn: await titleEn.inputValue(),
      titleZh: await titleZh.inputValue(),
      bodyEn: await bodyEn.inputValue(),
      bodyZh: await bodyZh.inputValue()
    };
    const inviteCode = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
    let guestContext: Awaited<ReturnType<typeof browser.newContext>> | null = null;

    try {
      await enabled.setChecked(true);
      await delay.fill("1");
      await titleEn.fill("E2E terms before registration");
      await bodyEn.fill("Please read this test notice before continuing.");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();

      const admin = await prisma.user.findUniqueOrThrow({
        where: { username: adminUsername! },
        select: { id: true }
      });
      await prisma.invite.create({
        data: {
          code: inviteCode,
          issuedById: admin.id,
          note: "E2E registration notice"
        }
      });
      const localInviteUrl = `${new URL(page.url()).origin}/en/register/${inviteCode}`;

      guestContext = await browser.newContext({
        storageState: { cookies: [], origins: [] }
      });
      const guest = await guestContext.newPage();
      await guest.goto(`${new URL(page.url()).origin}/en/register/not-a-real-invite`);
      await expect(
        guest.getByRole("heading", { name: "This invite link is not valid." })
      ).toBeVisible();
      await expect(guest.getByText("E2E terms before registration")).toHaveCount(0);

      await guest.goto(localInviteUrl);
      await expect(
        guest.getByRole("heading", { name: "E2E terms before registration" })
      ).toBeVisible();
      await expect(
        guest.getByText("Please read this test notice before continuing.")
      ).toBeVisible();
      const usernameInput = guest.locator('input[name="username"]');
      await expect(usernameInput).toHaveCount(0);
      const continueButton = guest.getByRole("button", {
        name: "Continue to registration"
      });
      await expect(continueButton).toBeDisabled();
      await expect(continueButton).toBeEnabled({ timeout: 3_000 });
      await continueButton.click();
      await expect(usernameInput).toBeVisible();
    } finally {
      await guestContext?.close();
      await prisma.invite.deleteMany({ where: { code: inviteCode } });
      await page.goto("/en/admin/invites");
      await page
        .getByRole("checkbox", { name: "Show this notice before registration" })
        .setChecked(original.enabled);
      await page.getByLabel("Continue delay (seconds)").fill(original.delay);
      await page.getByLabel("Notice title (English)").fill(original.titleEn);
      await page.getByLabel("Notice title (Chinese)").fill(original.titleZh);
      await page.getByLabel("Notice or EULA (English)").fill(original.bodyEn);
      await page.getByLabel("Notice or EULA (Chinese)").fill(original.bodyZh);
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
    }
  });

  test("photo selections upload immediately and accumulate in one pending queue", async ({ page }) => {
    const slug = `e2e-pending-photos-${Date.now()}`;
    await page.goto("/en/dashboard/events/new");
    await page.getByLabel("Title (English)").fill("E2E pending photo queue");
    await page.getByLabel("URL slug").fill(slug);
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page.waitForURL(/\/dashboard\/events\/(?!new$)[^/]+$/);

    const picker = page.locator('input[type="file"][accept*="image/jpeg"]');
    const batchQuality = page.getByLabel("Storage quality for the next selection");
    await expect(batchQuality).toHaveValue("balanced");
    await expect(page.getByText("Maximum size per photo: 100 MB.")).toBeVisible();

    // The native picker can select any size, so the app must reject an
    // oversized file before it is added to the queue or sent to the server.
    await picker.evaluate((element) => {
      const oversized = new File(["not really large"], "oversized.jpg", {
        type: "image/jpeg"
      });
      Object.defineProperty(oversized, "size", {
        value: 100 * 1024 * 1024 + 1
      });
      const transfer = new DataTransfer();
      transfer.items.add(oversized);
      (element as HTMLInputElement).files = transfer.files;
      element.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await expect(
      page.getByRole("alert").filter({
        hasText: "1 photo was not added because each photo must be 100 MB or smaller."
      })
    ).toBeVisible();
    await expect(page.getByText("No photos in the pending queue.")).toBeVisible();

    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64"
    );

    await picker.setInputFiles({ name: "first.png", mimeType: "image/png", buffer: png });
    await expect(page.getByText("1 photo queued")).toBeVisible();
    await expect(page.getByText("Ready to create")).toHaveCount(1);
    await expect(page.getByRole("progressbar", { name: "Total upload progress" })).toHaveAttribute(
      "aria-valuenow",
      "100"
    );
    await expect(page.getByRole("img", { name: "first.png" })).toBeVisible();
    await expect(page.getByText("Original", { exact: true })).toBeVisible();
    await expect(page.getByText("Balanced candidate")).toBeVisible();
    await expect(page.getByText("After Create")).toBeVisible();
    await expect(page.getByText("Pending now")).toBeVisible();

    const photoQuality = page.getByLabel("Storage quality", { exact: true });
    await photoQuality.selectOption("archive");
    await expect(photoQuality).toHaveValue("archive", { timeout: 15_000 });
    await expect(page.getByText("Archive candidate")).toBeVisible({ timeout: 15_000 });

    // Opening the native picker again replaces its own FileList. The app queue
    // must retain the first server-backed pending photo and append this one.
    await picker.setInputFiles({ name: "second.png", mimeType: "image/png", buffer: png });
    await expect(page.getByText("2 photos queued")).toBeVisible();
    await expect(page.getByText("Ready to create")).toHaveCount(2);
    await expect(page.getByLabel("Storage quality", { exact: true })).toHaveCount(2);
    await expect(page.getByLabel("Storage quality", { exact: true }).nth(0)).toHaveValue("archive");
    await expect(page.getByLabel("Storage quality", { exact: true }).nth(1)).toHaveValue("balanced");
    await expect(page.getByRole("img", { name: "second.png" })).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "Total upload progress" })).toHaveAttribute(
      "aria-valuenow",
      "100"
    );
    await expect(page.getByTestId("pending-photo-list")).toHaveCSS("overflow-y", "visible");

    await page.reload();
    await expect(page.getByRole("img", { name: "first.png" })).toBeVisible();
    await expect(page.getByRole("img", { name: "second.png" })).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "Total upload progress" })).toHaveAttribute(
      "aria-valuenow",
      "100"
    );

    await page.locator('input[list="known-credits"]').fill("E2E credit");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "2 photos created." })).toBeVisible();
    await expect(page.getByText("No photos in the pending queue.")).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete event" }).click();
    await expect(page).toHaveURL(/\/en\/dashboard\/events$/);
  });

  test("booking cannot open without readiness requirements", async ({ page }) => {
    const title = `E2E booking ${Date.now()}`;
    const date = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    await page.goto("/en/dashboard/bookings/new");
    await page.getByLabel("Title (English)").fill(title);
    await page.getByLabel("Event date").fill(date);
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page.waitForURL(/\/dashboard\/bookings\/(?!new$)[^/]+$/);

    await page.getByRole("checkbox", { name: "Open for public booking" }).check();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "No time slots yet" })).toBeVisible();

    await page.getByLabel("First slot starts").fill(`${date}T10:00`);
    await page.getByRole("button", { name: "Add slots" }).click();
    await expect(page.getByText(/10:00/).first()).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete booking event" }).click();
    await expect(page).toHaveURL(/\/en\/dashboard\/bookings$/);
  });
});
