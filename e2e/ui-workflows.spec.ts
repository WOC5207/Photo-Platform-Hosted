import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "crypto";
import { sealData } from "iron-session";
import sharp from "sharp";
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

    await page.goto("/en/dashboard/settings?section=features#lottery");
    await page.locator('aside button[aria-haspopup="dialog"]').click();
    await page
      .getByRole("dialog", { name: "Account" })
      .getByRole("link", { name: "中文" })
      .click();
    await expect(page).toHaveURL(
      /\/zh\/dashboard\/settings\?section=features#lottery$/
    );
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
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("link", { name: "Homepage", exact: true }).click();
    await expect(page).toHaveURL(/section=appearance/);
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

    const registrationNotice = page.locator("section").filter({
      has: page.getByRole("heading", {
        name: "Registration notice",
        exact: true
      })
    });
    const enabled = registrationNotice.getByRole("checkbox", {
      name: "Show this notice before registration"
    });
    const delay = registrationNotice.getByLabel("Continue delay (seconds)");
    const mode = registrationNotice.getByLabel("Notice behavior");
    const titleEn = registrationNotice.getByLabel("Notice title (English)");
    const titleZh = registrationNotice.getByLabel("Notice title (Chinese)");
    const bodyEn = registrationNotice.getByLabel("Notice or EULA (English)");
    const bodyZh = registrationNotice.getByLabel("Notice or EULA (Chinese)");
    const original = {
      enabled: await enabled.isChecked(),
      delay: await delay.inputValue(),
      mode: await mode.inputValue(),
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
      await mode.selectOption("consent");
      await titleEn.fill("E2E terms before registration");
      await bodyEn.fill("Please read this test notice before continuing.");
      await registrationNotice
        .getByRole("button", { name: "Save", exact: true })
        .click();
      await expect(
        registrationNotice.getByRole("status").filter({ hasText: /^Saved$/ })
      ).toBeVisible();

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
      await expect(usernameInput).toBeFocused();
      await expect(
        guest.getByRole("checkbox", {
          name: /I have read and agree to the registration notice/
        })
      ).toBeVisible();
    } finally {
      await guestContext?.close();
      await prisma.invite.deleteMany({ where: { code: inviteCode } });
      await page.goto("/en/admin/invites");
      await registrationNotice
        .getByRole("checkbox", { name: "Show this notice before registration" })
        .setChecked(original.enabled);
      await registrationNotice
        .getByLabel("Continue delay (seconds)")
        .fill(original.delay);
      await registrationNotice
        .getByLabel("Notice behavior")
        .selectOption(original.mode);
      await registrationNotice
        .getByLabel("Notice title (English)")
        .fill(original.titleEn);
      await registrationNotice
        .getByLabel("Notice title (Chinese)")
        .fill(original.titleZh);
      await registrationNotice
        .getByLabel("Notice or EULA (English)")
        .fill(original.bodyEn);
      await registrationNotice
        .getByLabel("Notice or EULA (Chinese)")
        .fill(original.bodyZh);
      await registrationNotice
        .getByRole("button", { name: "Save", exact: true })
        .click();
      await expect(
        registrationNotice.getByRole("status").filter({ hasText: /^Saved$/ })
      ).toBeVisible();
    }
  });

  test("photo wizard uploads, compresses, credits and publishes step by step", async ({ page }) => {
    const slug = `e2e-pending-photos-${Date.now()}`;
    await page.goto("/en/dashboard/events/new");
    await page.getByLabel("Title (English)").fill("E2E pending photo queue");
    await page.getByLabel("URL slug").fill(slug);
    await page.getByRole("checkbox", { name: /Published/ }).check();
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page.waitForURL(/\/dashboard\/events\/(?!new$)[^/]+$/);
    const editUrl = page.url();

    // The edit page no longer hosts the uploader; the guided wizard does.
    await page.getByRole("link", { name: "Add photos" }).click();
    await page.waitForURL(/\/dashboard\/events\/[^/]+\/photos$/);

    const picker = page.locator('input[type="file"][accept*="image/jpeg"]');
    // The upload step no longer carries its own storage-quality selector; that
    // choice lives solely on the compression step now.
    await expect(page.getByLabel("Storage quality for the next selection")).toHaveCount(0);
    await expect(page.getByText("Maximum size per photo: 100 MB.")).toBeVisible();
    let forwardButton = page.getByRole("button", { name: "Choose photo size" });
    await expect(forwardButton).toBeEnabled();
    await forwardButton.click();
    await expect(page.locator("#wizard-upload-action")).toBeFocused();
    await expect(page.locator("#wizard-upload-action")).toHaveAttribute(
      "data-guidance-active",
      "true"
    );

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
    // The upload settles fast (source + thumbnail) and compression is deferred
    // to the next step, so the file reads "Uploaded" as soon as the transfer
    // finishes — no waiting on Sharp — and the forward action unlocks immediately.
    await expect(page.getByText("Uploaded", { exact: true })).toHaveCount(1, { timeout: 15_000 });
    await expect(forwardButton).toBeEnabled();
    await expect(page.getByRole("progressbar", { name: "Total upload progress" })).toHaveAttribute(
      "aria-valuenow",
      "100"
    );
    await expect(page.getByRole("img", { name: "first.png" })).toBeVisible();

    // Opening the native picker again replaces its own FileList. The app queue
    // must retain the first server-backed pending photo and append this one.
    await picker.setInputFiles({ name: "second.png", mimeType: "image/png", buffer: png });
    await expect(page.getByText("2 photos queued")).toBeVisible();
    await expect(page.getByText("Uploaded", { exact: true })).toHaveCount(2, { timeout: 15_000 });
    await expect(page.getByRole("img", { name: "second.png" })).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "Total upload progress" })).toHaveAttribute(
      "aria-valuenow",
      "100"
    );
    await expect(page.getByTestId("pending-photo-list")).toHaveCSS("overflow-y", "visible");

    // Windows may report TIFF as a generic binary file. The filename fallback
    // must still admit .tif/.tiff while Sharp validates the actual bytes.
    const tiff = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 3,
        background: { r: 30, g: 120, b: 70 }
      }
    })
      .tiff({ compression: "lzw" })
      .toBuffer();
    await picker.setInputFiles({
      name: "third.tiff",
      mimeType: "application/octet-stream",
      buffer: tiff
    });
    await expect(page.getByText("3 photos queued")).toBeVisible();
    await expect(page.getByText("Uploaded", { exact: true })).toHaveCount(3, { timeout: 15_000 });
    await expect(page.getByRole("img", { name: "third.tiff" })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("img", { name: "first.png" })).toBeVisible();
    await expect(page.getByRole("img", { name: "second.png" })).toBeVisible();
    await expect(page.getByRole("img", { name: "third.tiff" })).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "Total upload progress" })).toHaveAttribute(
      "aria-valuenow",
      "100"
    );

    page.once("dialog", (dialog) => dialog.dismiss());
    await page
      .getByRole("button", { name: "Remove first.png from the pending upload queue" })
      .click();
    await expect(page.getByText("3 photos queued")).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", { name: "Remove first.png from the pending upload queue" })
      .click();
    await expect(page.getByText("2 photos queued")).toBeVisible();
    await picker.setInputFiles({ name: "first.png", mimeType: "image/png", buffer: png });
    await expect(page.getByText("3 photos queued")).toBeVisible();
    await expect(page.getByText("Uploaded", { exact: true })).toHaveCount(3, { timeout: 15_000 });

    // Step 2 — compression: nothing is compressed until the user starts it.
    await expect(forwardButton).toBeEnabled();
    await forwardButton.click();
    forwardButton = page.getByRole("button", { name: "Continue to Credit" });
    const grid = page.getByTestId("wizard-photo-grid");
    await expect(grid.getByRole("button")).toHaveCount(3);

    // On entry every photo awaits a size. Clicking the forward action from the
    // bottom of a long batch must guide the user back to the required controls.
    await expect(grid.getByText("Awaiting size")).toHaveCount(3);
    await expect(page.getByText(/^Estimated total after publishing:/)).toBeVisible();
    await expect(forwardButton).toBeEnabled();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await forwardButton.click();
    await expect(page.locator("#wizard-compression-actions")).toBeFocused();
    await expect(page.locator("#wizard-compression-actions")).toHaveAttribute(
      "data-guidance-active",
      "true"
    );

    // Advancing from the previous step selects every photo by default; compress
    // them all at Balanced (4096px) first, which starts the deferred encode.
    await expect(page.getByText("3 selected")).toBeVisible();
    await page.getByLabel("Compression size", { exact: true }).selectOption("balanced");
    await page.getByRole("button", { name: "Apply size to all (3)" }).click();
    await expect(grid.getByText(/^Balanced/)).toHaveCount(3, { timeout: 20_000 });
    await expect(page.getByText(/^Total size after publishing:/)).toBeVisible();

    // Then give the first photo a different size (Archive · 6000px) to prove
    // per-photo overrides still work after the initial compression.
    await page.getByRole("button", { name: "Clear selection" }).click();
    await grid.getByRole("button", { name: "Select first.png" }).click();
    await expect(page.getByText("1 selected")).toBeVisible();
    await page.getByLabel("Compression size", { exact: true }).selectOption("archive");
    await page.getByRole("button", { name: "Compress selected (1)" }).click();
    await expect(grid.getByText(/^Archive/)).toBeVisible({ timeout: 20_000 });
    await expect(grid.getByText(/^Balanced/)).toHaveCount(2);

    // Step 3 — credits: only the first photo gets one; the rest stay
    // uncredited on purpose. All photos start selected on entry.
    await forwardButton.click();
    forwardButton = page.getByRole("button", { name: "Review and publish" });
    await expect(page.getByText("3 selected")).toBeVisible();
    await page.getByRole("button", { name: "Clear selection" }).click();
    await page.getByRole("button", { name: "Select first.png" }).click();
    await page.locator('input[list="known-credits"]').fill("E2E credit");
    await page.getByRole("button", { name: "Apply to selected (1)" }).click();
    await expect(grid.getByText("E2E credit")).toBeVisible();
    await expect(grid.getByText("No credit")).toHaveCount(2);

    // Attach a searchable comment to the still-selected credited photo. The
    // note text deliberately shares no substring with the credit, so a search
    // that finds it proves the comment itself is indexed.
    await page.getByText("Optional comments", { exact: true }).click();
    await page.getByLabel("Comment (optional)").fill("E2E note about the shoot");
    await page
      .getByRole("button", { name: "Apply comment to selected (1)" })
      .click();
    await expect(grid.getByText("E2E note about the shoot")).toBeVisible();

    // The no-credit warning now appears on the credits step and must be
    // acknowledged before advancing to Confirm.
    await expect(
      page.getByText("2 photos have no credit and will be published without attribution.")
    ).toBeVisible();
    await expect(forwardButton).toBeEnabled();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await forwardButton.click();
    await expect(page.locator("#wizard-uncredited-action")).toBeFocused();
    await expect(page.locator("#wizard-uncredited-action")).toHaveAttribute(
      "data-guidance-active",
      "true"
    );
    await page
      .getByRole("checkbox", { name: "Publish these photos without a credit" })
      .check();
    await expect(forwardButton).toBeEnabled();

    // Step 4 — confirm: album preview, totals and publish. The acknowledgement
    // was already given on the credits step, so publishing is ready.
    await forwardButton.click();
    await expect(page.getByText("Photos to publish")).toBeVisible();
    await expect(page.getByText("Total size after publishing")).toBeVisible();
    await expect(page.getByText("E2E credit — 1 photo")).toBeVisible();
    await expect(page.getByText("2 photos without credit")).toBeVisible();
    const publishButton = page.getByRole("button", { name: "Publish 3 photos" });
    await expect(publishButton).toBeEnabled();
    await publishButton.click();

    // Publishing finalizes one PATCH per credit group (credited + uncredited)
    // and returns to the event's photo section.
    await page.waitForURL(/\/dashboard\/events\/[^/]+#photos$/);

    // All three photos — including the two uncredited ones — reach the
    // public album.
    await page.getByRole("link", { name: "View public page" }).click();
    await expect(page).toHaveURL(new RegExp(`/en/u/[^/]+/gallery/${slug}$`));
    await expect(page.getByText("3 photos")).toBeVisible();
    await expect(page.getByText("E2E credit")).toBeAttached();

    // The comment shows under the credit on the enlarged photo …
    const ownerUsername = page.url().match(/\/u\/([^/]+)\/gallery\//)![1];
    await page.getByRole("img", { name: "E2E credit" }).click();
    await expect(page.getByText("E2E note about the shoot")).toBeVisible();
    await page.keyboard.press("Escape");

    // … and it is searchable from the homepage, even though the query matches
    // only the comment and not the credit.
    await page.goto(`/en/u/${ownerUsername}`);
    await page.getByRole("combobox").fill("E2E note about the shoot");
    await expect(
      page.getByRole("option").filter({ hasText: "E2E credit" })
    ).toBeVisible({ timeout: 10_000 });

    await page.goto(editUrl);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete event" }).click();
    await expect(page).toHaveURL(/\/en\/dashboard\/events$/);
  });

  test("platform notification shows on the dashboard until dismissed", async ({ page }) => {
    const title = `E2E notice ${Date.now()}`;

    // Compose to all accounts (the default audience).
    await page.goto("/en/admin/notifications");
    await page.getByLabel("Title (English)").fill(title);
    await page.getByLabel("Message (English)").fill("E2E notification body");
    await page.getByRole("button", { name: "Send notification" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Notification sent." })
    ).toBeVisible();
    const sentItem = page.locator("li").filter({ hasText: title });
    await expect(sentItem.getByTestId("dismissed-count")).toHaveText(
      /Dismissed by 0 of \d+/
    );

    // The banner greets the recipient in their management area.
    await page.goto("/en/dashboard");
    const notice = page
      .locator('[data-testid="platform-notices"] section')
      .filter({ hasText: title });
    await expect(notice).toBeVisible();
    await expect(notice.getByText("E2E notification body")).toBeVisible();

    // Dismissing is per user and durable across reloads.
    await notice.getByRole("button", { name: "Dismiss" }).click();
    await expect(notice).toHaveCount(0);
    await page.reload();
    await expect(
      page.locator('[data-testid="platform-notices"] section').filter({ hasText: title })
    ).toHaveCount(0);

    // The admin list reflects the dismissal, and deleting retracts the
    // notification everywhere.
    await page.goto("/en/admin/notifications");
    await expect(sentItem.getByTestId("dismissed-count")).toHaveText(
      /Dismissed by 1 of \d+/
    );
    page.once("dialog", (dialog) => dialog.accept());
    await sentItem.getByRole("button", { name: "Delete" }).click();
    await expect(sentItem).toHaveCount(0);
  });

  test("multi-day booking: calendar day-picker, per-day availability tabs, public day tabs", async ({ page }) => {
    const title = `E2E multiday ${Date.now()}`;
    // Two specific days in next month, so the calendar cells always exist (day
    // 10 and 12 are present in every month) and are safely in the future.
    const now = new Date();
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const isoDay = (day: number) =>
      `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const day1 = isoDay(10);
    const day2 = isoDay(12);

    await page.goto("/en/dashboard/bookings/new");
    await page.getByLabel("Title (English)").fill(title);

    // Calendar day-picker: advance to next month, then pick two specific days.
    await page.getByRole("button", { name: "Next month" }).click();
    await page.getByRole("button", { name: day1, exact: true }).click();
    await page.getByRole("button", { name: day2, exact: true }).click();
    await expect(page.getByText("2 days selected")).toBeVisible();
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page.waitForURL(/\/dashboard\/bookings\/(?!new$)[^/]+$/);

    // The availability section is now tabbed — one tab per selected day.
    const dayTabs = page.getByRole("tablist").getByRole("tab");
    await expect(dayTabs).toHaveCount(2);

    // Opening for public booking is still blocked until there are slots.
    await page.getByRole("checkbox", { name: "Open for public booking" }).check();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "No time slots yet" })).toBeVisible();

    // Add a slot under each day tab. Only the active day's adder is mounted.
    await page.getByLabel("First slot time").fill("10:00");
    await page.getByRole("button", { name: "Add slots" }).click();
    await expect(page.getByText(/10:00/).first()).toBeVisible();

    await dayTabs.nth(1).click();
    await page.getByLabel("First slot time").fill("14:00");
    await page.getByRole("button", { name: "Add slots" }).click();
    await expect(page.getByText(/14:00/).first()).toBeVisible();

    const event = await prisma.bookingEvent.findFirstOrThrow({
      where: { titleEn: title },
      orderBy: { createdAt: "desc" }
    });

    try {
      // Reload so the just-added slots render from settled server state — the
      // open toggle is an uncontrolled checkbox, and racing it against the
      // slot-add revalidation can submit a stale (unchecked) value.
      await page.reload();
      const openCheckbox = page.getByRole("checkbox", {
        name: "Open for public booking"
      });
      await openCheckbox.check();
      await expect(openCheckbox).toBeChecked();
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
      // Confirm the open state actually persisted before hitting the public page.
      await expect
        .poll(() =>
          prisma.bookingEvent
            .findUnique({ where: { id: event.id }, select: { open: true } })
            .then((e) => e?.open)
        )
        .toBe(true);

      // Public page: two day tabs; switch to the second day and book its slot.
      await page.goto(`/en/book/${event.token}`);
      const publicDayTabs = page
        .getByRole("tablist", { name: "Choose a day" })
        .getByRole("tab");
      await expect(publicDayTabs).toHaveCount(2);
      await publicDayTabs.nth(1).click();

      await page.getByRole("radio").first().check();
      await page.getByLabel("CN").fill("E2E Visitor");
      await page.getByLabel("Contact info").fill("visitor@example.com");
      await page.getByRole("button", { name: "Book this slot" }).click();
      await expect(page).toHaveURL(/\/en\/my-booking\/[a-z0-9]+/);

      // The booking landed on the *second* day's slot, proving the tab routed
      // the reservation to the right day.
      const booking = await prisma.booking.findFirstOrThrow({
        where: { name: "E2E Visitor", timeSlot: { bookingEventId: event.id } },
        include: { timeSlot: { include: { bookingDay: true } } }
      });
      expect(booking.timeSlot.bookingDay.date.toISOString().slice(0, 10)).toBe(day2);
    } finally {
      await prisma.bookingEvent.delete({ where: { id: event.id } }).catch(() => {});
    }
  });

  test(
    "lottery identity and recovery survive a locale switch",
    { tag: "@desktop-only" },
    async ({ page, context }) => {
      const admin = await prisma.user.findUniqueOrThrow({
        where: { username: adminUsername! },
        include: { settings: true }
      });
      const originalLotteryEnabled = admin.settings?.lotteryEnabled ?? false;
      let lotterySettingChanged = false;
      let eventId: string | null = null;
      let drawId: string | null = null;
      let drawToken: string | null = null;

      try {
        await prisma.siteSettings.update({
          where: { ownerId: admin.id },
          data: { lotteryEnabled: true }
        });
        lotterySettingChanged = true;

        const event = await prisma.bookingEvent.create({
          data: {
            ownerId: admin.id,
            token: randomUUID().replace(/-/g, ""),
            titleEn: "E2E locale lottery",
            titleZh: "E2E 多语言抽奖",
            date: new Date(Date.now() + 86_400_000),
            open: false,
            lotteryEnabled: true
          }
        });
        eventId = event.id;

        const draw = await prisma.lotteryDraw.create({
          data: {
            bookingEventId: event.id,
            token: randomUUID().replace(/-/g, ""),
            prizes: {
              create: { name: "E2E prize", quantity: 2, weight: 1 }
            }
          }
        });
        drawId = draw.id;
        drawToken = draw.token;

        await page.goto(`/en/draw/${drawToken}`);
        const entryForm = page.locator("form").first();
        await entryForm.locator('input[name="name"]').fill("Locale Visitor");
        await entryForm
          .locator('input[name="contactValue"]')
          .fill("visitor@example.com");
        await entryForm.getByRole("button", { name: "Enter the draw" }).click();

        const token = await page
          .getByRole("textbox", { name: "Your entry token" })
          .inputValue();
        expect(token).toMatch(/^[A-Z0-9]{5,12}$/);
        const storedEntry = await prisma.lotteryEntry.findFirstOrThrow({
          where: { drawId, token }
        });
        expect(storedEntry.contactValue).toBe("visitor@example.com");

        // Simulate returning without the authorization cookie, then switch
        // locale. Identity is now name + contact value alone; it must still
        // block a duplicate and recover the original entry across the switch.
        await context.clearCookies({ name: "visitor-session" });
        await page.goto(`/zh/draw/${drawToken}`);
        const duplicateForm = page.locator("form").first();
        await duplicateForm.locator('input[name="name"]').fill("Locale Visitor");
        await duplicateForm
          .locator('input[name="contactValue"]')
          .fill("visitor@example.com");
        await duplicateForm.locator('button[type="submit"]').click();
        await expect(duplicateForm.getByRole("alert")).toBeVisible();
        await expect
          .poll(() => prisma.lotteryEntry.count({ where: { drawId: draw.id } }))
          .toBe(1);

        await page.locator("details > summary").click();
        const recoveryForm = page.locator("details form");
        await recoveryForm.locator('input[name="entryToken"]').fill(token);
        await recoveryForm.locator('input[name="name"]').fill("Locale Visitor");
        await recoveryForm
          .locator('input[name="contactValue"]')
          .fill("visitor@example.com");
        await recoveryForm.locator('button[type="submit"]').click();
        await expect(page.locator(`input[readonly][value="${token}"]`)).toBeVisible();
      } finally {
        if (drawId) {
          await prisma.lotteryDraw.deleteMany({ where: { id: drawId } }).catch(() => {});
        }
        if (eventId) {
          await prisma.bookingEvent.deleteMany({ where: { id: eventId } }).catch(() => {});
        }
        if (lotterySettingChanged) {
          await prisma.siteSettings
            .update({
              where: { ownerId: admin.id },
              data: { lotteryEnabled: originalLotteryEnabled }
            })
            .catch(() => {});
        }
      }
    }
  );

  test("booking events can be merged under one link and split back apart", async ({ page }) => {
    const tag = Date.now();
    const now = new Date();
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const isoDay = (day: number) =>
      `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    async function createOneDayEvent(title: string, day: number): Promise<string> {
      await page.goto("/en/dashboard/bookings/new");
      await page.getByLabel("Title (English)").fill(title);
      await page.getByRole("button", { name: "Next month" }).click();
      await page.getByRole("button", { name: isoDay(day), exact: true }).click();
      await page.getByRole("button", { name: "Create", exact: true }).click();
      await page.waitForURL(/\/dashboard\/bookings\/(?!new$)[^/]+$/);
      return page.url().match(/bookings\/([^/?#]+)/)![1];
    }

    const titleA = `E2E merge A ${tag}`;
    const titleB = `E2E merge B ${tag}`;
    const eventAId = await createOneDayEvent(titleA, 10);
    await createOneDayEvent(titleB, 12);

    try {
      // Merge both events into A (keeps A's link).
      await page.goto("/en/dashboard/bookings");
      await page.getByRole("checkbox", { name: `Select ${titleA}` }).check();
      await page.getByRole("checkbox", { name: `Select ${titleB}` }).check();
      await page
        .getByRole("radio", { name: new RegExp(titleA) })
        .check();
      page.once("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: /Merge into/ }).click();

      // Redirected to A's page, now spanning both days (two tabs); B is gone.
      await page.waitForURL(new RegExp(`/dashboard/bookings/${eventAId}$`));
      await expect(page.getByRole("tablist").getByRole("tab")).toHaveCount(2);
      expect(
        await prisma.bookingEvent.count({ where: { titleEn: titleB } })
      ).toBe(0);
      expect(
        await prisma.bookingDay.count({ where: { bookingEventId: eventAId } })
      ).toBe(2);

      // Split the second day back out into a new event with its own link. The
      // day toggle is a visually-hidden checkbox behind a styled pill label, so
      // force the check past the label's pointer interception.
      await page.getByRole("checkbox", { name: /12/ }).check({ force: true });
      page.once("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: /Split off/ }).click();
      // Split redirects to the *new* event; wait for an id different from A's
      // (A's page already matches a generic booking-URL pattern).
      await page.waitForURL((url) => {
        const match = url.pathname.match(/\/dashboard\/bookings\/([^/]+)$/);
        return !!match && match[1] !== "new" && match[1] !== eventAId;
      });
      const newEventId = page.url().match(/bookings\/([^/?#]+)/)![1];

      expect(newEventId).not.toBe(eventAId);
      expect(
        await prisma.bookingDay.count({ where: { bookingEventId: eventAId } })
      ).toBe(1);
      expect(
        await prisma.bookingDay.count({ where: { bookingEventId: newEventId } })
      ).toBe(1);
    } finally {
      await prisma.bookingEvent
        .deleteMany({ where: { titleEn: { in: [titleA, titleB] } } })
        .catch(() => {});
    }
  });
});
