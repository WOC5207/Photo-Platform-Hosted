import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { sealData } from "iron-session";
import QRCode from "qrcode";
import { prisma } from "@/lib/db";
import { equipmentQrToken, equipmentContactSchema } from "@/lib/equipmentQr";

const sessionSecret = process.env.E2E_SESSION_SECRET ?? process.env.SESSION_SECRET;

test("QR parsing and contact validation", () => {
  const token = "12345678-1234-1234-1234-123456789abc";
  expect(equipmentQrToken(`https://example.com/en/equipment/${token}`)).toBe(token);
  for (const value of ["hello", "javascript:alert(1)", `https://example.com/en/equipment/${token}?next=bad`, "https://example.com/en/dashboard"]) expect(equipmentQrToken(value)).toBeNull();
  expect(equipmentContactSchema.safeParse({ equipmentContactMethod: "email", equipmentContactLabel: "", equipmentContactValue: "invalid" }).success).toBe(false);
  expect(equipmentContactSchema.safeParse({ equipmentContactMethod: "other", equipmentContactLabel: "", equipmentContactValue: "123" }).success).toBe(false);
});

test("scanner resolves images, adds items, updates inventory and protects ownership", async ({ page, browser }) => {
  test.skip(process.env.E2E_ALLOW_MUTATIONS !== "1", "Disposable database required");
  test.skip(!sessionSecret, "A session secret is required for the non-owner session fixture");
  const owner = await prisma.user.findUniqueOrThrow({ where: { username: process.env.E2E_ADMIN_USERNAME ?? process.env.ADMIN_USERNAME! } });
  const suffix = Date.now();
  const category = await prisma.equipmentCategory.create({ data: { ownerId: owner.id, name: `QR test ${suffix}`, normalizedName: `qr test ${suffix}` } });
  const item = await prisma.equipmentItem.create({ data: { ownerId: owner.id, categoryId: category.id, name: `QR camera ${suffix}`, serialNumber: `SN-${suffix}`, notes: "HIDDEN-INTERNAL-NOTE", statusNote: "HIDDEN-STATUS-NOTE" } });
  const checklist = await prisma.equipmentChecklist.create({ data: { ownerId: owner.id, name: `QR list ${suffix}` } });
  const foreign = await prisma.user.create({ data: { username: `qr-foreign-${suffix}`, passwordHash: "unused" } });
  const foreignCategory = await prisma.equipmentCategory.create({ data: { ownerId: foreign.id, name: "Foreign", normalizedName: "foreign" } });
  const foreignItem = await prisma.equipmentItem.create({ data: { ownerId: foreign.id, categoryId: foreignCategory.id, name: "FOREIGN-SECRET" } });
  const original = await prisma.siteSettings.findUnique({ where: { ownerId: owner.id } });
  const origin = process.env.PLAYWRIGHT_BASE_URL!;
  const url = `${origin}/en/equipment/${item.qrToken}`;
  const anonymous = await browser.newContext({ baseURL: origin });
  const foreignContext = await browser.newContext({ baseURL: origin });
  await anonymous.clearCookies();
  await foreignContext.clearCookies();
  const foreignSession = await sealData(
    { userId: foreign.id, credentialVersion: foreign.credentialVersion },
    { password: sessionSecret!, ttl: 60 * 60 }
  );
  await foreignContext.addCookies([{ name: "session", value: foreignSession, url: origin, httpOnly: true, sameSite: "Lax", secure: true }]);
  try {
    await page.goto("/en/dashboard/equipment/contact");
    await page.getByRole("combobox", { name: "Contact method", exact: true }).selectOption("wechat");
    await page.getByLabel("Contact value", { exact: true }).fill("qr-photographer");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Saved.");
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
    await page.goto(`/en/dashboard/equipment/${item.id}`);
    await page.locator('input[type="file"]').setInputFiles({ name: "camera.png", mimeType: "image/png", buffer: png });
    await expect(page.getByRole("status")).toBeVisible();
    const uploaded = await prisma.equipmentItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(uploaded.photoToken).toBeTruthy();
    const photo = { url: `/api/admin/equipment-image/${uploaded.photoToken}.webp` };
    expect((await anonymous.request.get(photo.url)).status()).toBe(404);
    const publicPhoto = `/api/equipment/${item.qrToken}/photo`;
    expect((await anonymous.request.get(publicPhoto)).status()).toBe(200);
    const publicPage = await anonymous.newPage();
    await publicPage.goto(url);
    await expect(publicPage.getByText("qr-photographer", { exact: true })).toBeVisible();
    await expect(publicPage.getByText(`Serial: SN-${suffix}`, { exact: true })).toBeVisible();
    await expect(publicPage.getByRole("img", { name: item.name })).toBeVisible();
    await expect(publicPage.getByText("HIDDEN-INTERNAL-NOTE")).toHaveCount(0);
    await expect(publicPage.getByText("HIDDEN-STATUS-NOTE")).toHaveCount(0);
    await expect(publicPage.getByRole("region", { name: "Quick inventory status" })).toHaveCount(0);
    await expect(publicPage.getByRole("link", { name: "Edit" })).toHaveCount(0);
    await expect(publicPage.getByText("Current status", { exact: false })).toHaveCount(0);

    const foreignPage = await foreignContext.newPage();
    await foreignPage.goto(url);
    await expect(foreignPage.getByText("qr-photographer", { exact: true })).toBeVisible();
    await expect(foreignPage.getByText(`Serial: SN-${suffix}`, { exact: true })).toBeVisible();
    await expect(foreignPage.getByRole("region", { name: "Quick inventory status" })).toHaveCount(0);
    await expect(foreignPage.getByRole("link", { name: "Edit" })).toHaveCount(0);

    await page.goto(url);
    const ownerTools = page.getByRole("region", { name: "Quick inventory status" });
    await expect(ownerTools).toBeVisible();
    await expect(ownerTools.getByText("Current status: In inventory", { exact: true })).toBeVisible();
    await expect(ownerTools.getByRole("link", { name: "Edit", exact: true })).toHaveAttribute("href", `/en/dashboard/equipment/${item.id}`);
    let statusRequest: Awaited<ReturnType<typeof page.waitForRequest>> | null = null;
    for (const [label, status] of [["In use", "SIGNED_OUT"], ["Broken", "BROKEN"], ["In inventory", "IN_INVENTORY"]] as const) {
      const nextRequest = page.waitForRequest(r => r.method() === "POST" && Boolean(r.headers()["next-action"]));
      await ownerTools.getByRole("button", { name: label, exact: true }).click();
      const captured = await nextRequest;
      statusRequest ??= captured;
      await expect(ownerTools.getByText(`Current status: ${label}`, { exact: true })).toBeVisible();
      await expect(ownerTools.getByRole("status")).toHaveText("Inventory status updated.");
      await expect.poll(async () => (await prisma.equipmentItem.findUniqueOrThrow({ where: { id: item.id } })).status).toBe(status);
    }
    const privateFields = await prisma.equipmentItem.findUniqueOrThrow({ where: { id: item.id }, select: { notes: true, statusNote: true } });
    expect(privateFields).toEqual({ notes: "HIDDEN-INTERNAL-NOTE", statusNote: "HIDDEN-STATUS-NOTE" });

    const replayHeaders = {
      "next-action": statusRequest!.headers()["next-action"],
      "content-type": statusRequest!.headers()["content-type"],
      origin
    };
    const replayBody = statusRequest!.postDataBuffer()!;
    const anonymousDenied = await anonymous.request.post(statusRequest!.url(), { headers: replayHeaders, data: replayBody });
    expect(await anonymousDenied.text()).toContain("unauthorized");
    const foreignDenied = await foreignContext.request.post(statusRequest!.url(), { headers: replayHeaders, data: replayBody });
    expect(await foreignDenied.text()).toContain("forbidden");
    expect((await prisma.equipmentItem.findUniqueOrThrow({ where: { id: item.id } })).status).toBe("IN_INVENTORY");
    await page.screenshot({ path: `test-results/qr-owner-${test.info().project.name}.png`, fullPage: true });

    await page.goto(`${origin}/zh/equipment/${item.qrToken}`);
    await expect(page.getByRole("region", { name: "快速更新器材状态" })).toBeVisible();
    await expect(page.getByRole("button", { name: "使用中", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    await page.goto(`/en/dashboard/preparation/equipment/${checklist.id}`);
    await page.getByRole("button", { name: "Scan equipment QR", exact: true }).click();
    const panel = page.getByRole("region", { name: "Scan equipment QR" });
    await page.evaluate(() => {
      navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("Denied", "NotAllowedError"); };
    });
    await panel.getByRole("button", { name: "Start camera", exact: true }).click();
    await expect(panel.getByRole("alert")).toContainText("Camera unavailable");
    await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 400; canvas.height = 300;
      const stream = canvas.captureStream(5);
      setInterval(() => { canvas.getContext("2d")!.fillRect(0, 0, 400, 300); }, 100);
      (window as unknown as { testStream: MediaStream }).testStream = stream;
      navigator.mediaDevices.getUserMedia = async () => stream;
      navigator.mediaDevices.enumerateDevices = async () => [];
    });
    await panel.getByRole("button", { name: "Start camera", exact: true }).click();
    await expect(panel.getByRole("button", { name: "Stop camera", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Close scanner", exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { testStream: MediaStream }).testStream.getTracks().every(t => t.readyState === "ended"))).toBe(true);
    await page.getByRole("button", { name: "Scan equipment QR", exact: true }).click();
    await panel.getByText("Other ways to scan", { exact: true }).click();
    await panel.getByLabel("Paste QR link").fill("not-a-code");
    await panel.getByRole("button", { name: "Process QR link" }).click();
    await expect(panel.getByRole("alert")).toContainText("not a valid");
    const scanRequest = page.waitForRequest(r => r.method() === "POST" && Boolean(r.headers()["next-action"]));
    await panel.getByLabel("Scan QR image").setInputFiles({ name: "qr.png", mimeType: "image/png", buffer: await QRCode.toBuffer(url) });
    const request = await scanRequest;
    await expect(panel.getByRole("status")).toContainText(`${item.name} added and updated`);
    await expect.poll(async () => (await prisma.equipmentItem.findUniqueOrThrow({ where: { id: item.id } })).status).toBe("SIGNED_OUT");
    await expect.poll(async () => (await prisma.equipmentChecklistItem.findFirstOrThrow({ where: { checklistId: checklist.id, equipmentId: item.id } })).eventState).toBe("AT_EVENT");
    await expect(panel.getByText("1 / 1", { exact: true })).toBeVisible();

    const actionId = request.headers()["next-action"];
    for (const [operation, status, eventState] of [
      ["RETURN", "IN_INVENTORY", "RETURNED"],
      ["REPORT_BROKEN", "BROKEN", "BROKEN"],
      ["ARRIVAL", "SIGNED_OUT", "AT_EVENT"]
    ] as const) {
      const response = await page.evaluate(async ({ actionId: nextAction, args }) => (
        await fetch(location.href, {
          method: "POST",
          headers: { "next-action": nextAction, "content-type": "text/plain;charset=UTF-8" },
          body: JSON.stringify(args)
        })
      ).text(), { actionId, args: [checklist.id, url, operation] });
      expect(response).toContain(eventState);
      await expect.poll(async () => (await prisma.equipmentItem.findUniqueOrThrow({ where: { id: item.id } })).status).toBe(status);
      await expect.poll(async () => (await prisma.equipmentChecklistItem.findFirstOrThrow({ where: { checklistId: checklist.id, equipmentId: item.id } })).eventState).toBe(eventState);
    }
    const duplicate = await page.evaluate(async ({ actionId: nextAction, args }) => (
      await fetch(location.href, {
        method: "POST",
        headers: { "next-action": nextAction, "content-type": "text/plain;charset=UTF-8" },
        body: JSON.stringify(args)
      })
    ).text(), { actionId, args: [checklist.id, url, "ARRIVAL"] });
    expect(duplicate).toContain("duplicate");
    expect(duplicate).toContain("true");
    expect(await prisma.equipmentChecklistItem.count({ where: { checklistId: checklist.id, equipmentId: item.id } })).toBe(1);
    // Replay the actual action transport without an authenticated session.
    const denied = await anonymous.request.post(request.url(), { headers: { "next-action": actionId, origin, "content-type": "text/plain;charset=UTF-8" }, data: JSON.stringify([checklist.id, url, "BROKEN"]) });
    expect(await denied.text()).toContain("unauthorized");
    for (const operation of ["lookup", "add", "BROKEN"]) {
    const foreignLookup = await page.evaluate(async ({ actionId, args }) => (await fetch(location.href, { method: "POST", headers: { "next-action": actionId, "content-type": "text/plain;charset=UTF-8" }, body: JSON.stringify(args) })).text(), { actionId, args: [checklist.id, `${origin}/en/equipment/${foreignItem.qrToken}`, operation] });
    expect(foreignLookup).toContain("notFound");
    expect(foreignLookup).not.toContain("FOREIGN-SECRET");
    }
    for (let i = 0; i < 2; i++) await page.evaluate(async ({ actionId, args }) => (await fetch(location.href, { method: "POST", headers: { "next-action": actionId, "content-type": "text/plain;charset=UTF-8" }, body: JSON.stringify(args) })).text(), { actionId, args: [checklist.id, url, "add"] });
    expect(await prisma.equipmentChecklistItem.count({ where: { checklistId: checklist.id } })).toBe(1);
    await page.screenshot({ path: `test-results/qr-scanner-${test.info().project.name}.png`, fullPage: true });
    await page.goto(`/zh/dashboard/preparation/equipment/${checklist.id}`);
    await page.getByRole("button", { name: "扫描器材二维码", exact: true }).click();
    await page.getByText("其他扫描方式", { exact: true }).click();
    await expect(page.getByLabel("粘贴二维码链接")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.goto(`/en/dashboard/equipment/${item.id}`);
    await page.locator('input[type="file"]').setInputFiles({ name: "replacement.png", mimeType: "image/png", buffer: png });
    await expect(page.getByRole("status")).toBeVisible();
    const replaced = await prisma.equipmentItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(replaced.photoToken).not.toBe(uploaded.photoToken);
    expect((await anonymous.request.get(photo.url)).status()).toBe(404);
    expect((await anonymous.request.get(publicPhoto)).status()).toBe(200);
    await page.goto("/en/dashboard/equipment/contact");
    await page.getByLabel("Contact value", { exact: true }).fill("");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Saved.");
    await publicPage.reload();
    await expect(publicPage.getByText("qr-photographer", { exact: true })).toHaveCount(0);
    await prisma.equipmentItem.update({ where: { id: item.id }, data: { photoToken: "", serialNumber: "" } });
    expect((await anonymous.request.get(publicPhoto)).status()).toBe(404);
    await publicPage.reload();
    await expect(publicPage.getByRole("img", { name: item.name })).toHaveCount(0);
    expect((await anonymous.request.get("/en/equipment/not-a-valid-token")).status()).toBe(404);
    const foreignPublicUrl = `/en/equipment/${foreignItem.qrToken}`;
    expect((await anonymous.request.get(foreignPublicUrl)).status()).toBe(200);
    await prisma.user.update({ where: { id: foreign.id }, data: { status: "suspended" } });
    expect((await anonymous.request.get(`/api/equipment/${foreignItem.qrToken}/photo`)).status()).toBe(404);
    expect((await anonymous.request.get(foreignPublicUrl)).status()).toBe(404);

    const replacementQrToken = randomUUID();
    await prisma.equipmentItem.update({ where: { id: item.id }, data: { qrToken: replacementQrToken } });
    expect((await anonymous.request.get(`/en/equipment/${item.qrToken}`)).status()).toBe(404);
    expect((await anonymous.request.get(`/en/equipment/${replacementQrToken}`)).status()).toBe(200);
    const staleAction = await page.evaluate(async ({ url, headers, body }) => {
      const response = await fetch(url, { method: "POST", headers, body, credentials: "include" });
      return response.text();
    }, { url: statusRequest!.url(), headers: replayHeaders, body: statusRequest!.postData()! });
    expect(staleAction).toContain("missing");
    await prisma.equipmentItem.delete({ where: { id: item.id } });
    expect((await anonymous.request.get(publicPhoto)).status()).toBe(404);
    expect((await anonymous.request.get(`/en/equipment/${replacementQrToken}`)).status()).toBe(404);
  } finally {
    await anonymous.close();
    await foreignContext.close();
    await prisma.equipmentChecklist.deleteMany({ where: { id: checklist.id } });
    await prisma.equipmentItem.deleteMany({ where: { id: item.id } });
    await prisma.equipmentCategory.deleteMany({ where: { id: category.id } });
    await prisma.user.deleteMany({ where: { id: foreign.id } });
    await prisma.siteSettings.updateMany({ where: { ownerId: owner.id }, data: { equipmentContactMethod: original?.equipmentContactMethod ?? "", equipmentContactLabel: original?.equipmentContactLabel ?? "", equipmentContactValue: original?.equipmentContactValue ?? "" } });
  }
});
