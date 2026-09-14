/** Browser-only fixture: no database, provider requests, or account mutations. */
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import sharp from "sharp";
import en from "../messages/en.json";
import zh from "../messages/zh.json";

async function main() {
  const bundle = await build({ entryPoints: ["scripts/fixtures/cosplan-mobile.tsx"], bundle: true, write: false, platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' } });
  const cssFiles = await readdir(".next/static/css");
  const css = (await Promise.all(cssFiles.filter((file) => file.endsWith(".css")).map((file) => readFile(`.next/static/css/${file}`, "utf8")))).join("\n");
  const server = createServer((req, res) => {
    if (req.url === "/app.js") { res.setHeader("Content-Type", "text/javascript"); res.end(bundle.outputFiles[0].contents); }
    else if (req.url === "/style.css") { res.setHeader("Content-Type", "text/css"); res.end(css); }
    else if (req.url === "/background.svg") { res.setHeader("Content-Type", "image/svg+xml"); res.end('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="#334455"/><path d="M0 500H800M400 0V1000" stroke="#64748b"/></svg>'); }
    else { res.setHeader("Content-Type", "text/html"); res.end('<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>'); }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const locale of ["en", "zh"] as const) for (const width of [320, 375, 768]) {
      const labels = (locale === "zh" ? zh : en).cosplan;
      const page = await browser.newPage({ viewport: { width, height: 812 }, isMobile: true, hasTouch: true });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${address.port}?locale=${locale}`);
      await page.evaluate((dark) => document.documentElement.classList.add(dark ? "dark" : "light"), locale === "zh");
      await page.getByRole("button", { name: /Test poster/ }).click();
      await page.getByRole("navigation", { name: labels.tools }).getByRole("button", { name: labels.text, exact: true }).click();
      await page.getByRole("button", { name: labels.addText, exact: true }).filter({ visible: true }).click();
      const field = page.getByRole("textbox", { name: labels.content, exact: true }).filter({ visible: true });
      await field.waitFor();
      assert.equal(await field.inputValue(), "");
      await field.fill("Hello 中文\nCosplan 🎉");
      assert.equal(await field.evaluate((el) => el === document.activeElement), true);
      await page.getByRole("button", { name: labels.doneText, exact: true }).click();
      await page.getByRole("button", { name: labels.moreText, exact: true }).click();
      await page.getByRole("spinbutton", { name: "rotation", exact: true }).filter({ visible: true }).fill("37");
      await page.getByRole("button", { name: labels.editText, exact: true }).click();
      assert.equal(await field.inputValue(), "Hello 中文\nCosplan 🎉");
      await field.fill("Cancelled");
      await page.getByRole("button", { name: labels.cancelText, exact: true }).click();
      await page.getByRole("button", { name: labels.editText, exact: true }).click();
      assert.equal(await field.inputValue(), "Hello 中文\nCosplan 🎉");
      // Repeated input must retain the same DOM node, including IME composition.
      await field.evaluate((el) => { el.dataset.sessionNode = "stable"; el.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })); });
      await field.fill("中文输入");
      await field.evaluate((el) => el.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "中文输入" })));
      assert.equal(await field.getAttribute("data-session-node"), "stable");
      await page.setViewportSize({ width, height: 430 });
      await expect.poll(async () => { const done = await page.getByRole("button", { name: labels.doneText, exact: true }).boundingBox(); return done ? done.y + done.height : Infinity; }).toBeLessThanOrEqual(430);
      await page.screenshot({ path: `test-results/cosplan-inline-${locale}-${width}.png` });
      await page.getByRole("button", { name: labels.doneText, exact: true }).click();
      await page.setViewportSize({ width, height: 812 });
      await page.getByRole("button", { name: labels.undo, exact: true }).click();
      await page.getByRole("navigation", { name: labels.tools }).getByRole("button", { name: labels.layers, exact: true }).click();
      await page.getByRole("button", { name: new RegExp(`01.*${labels.textLayer}`) }).filter({ visible: true }).click();
      await page.getByRole("button", { name: labels.editText, exact: true }).click();
      assert.equal(await field.inputValue(), "Hello 中文\nCosplan 🎉");
      await page.getByRole("button", { name: labels.doneText, exact: true }).click();
      await page.getByRole("button", { name: labels.moreText, exact: true }).click();
      assert.equal(await page.getByRole("spinbutton", { name: "rotation", exact: true }).filter({ visible: true }).inputValue(), "37");
      await page.getByRole("navigation", { name: labels.tools }).getByRole("button", { name: labels.export, exact: true }).click();
      const downloadEvent = page.waitForEvent("download");
      await page.getByRole("button", { name: labels.downloadPng, exact: true }).filter({ visible: true }).click();
      const download = await downloadEvent;
      const metadata = await sharp((await download.path())!).metadata();
      assert.equal(metadata.width, 800); assert.equal(metadata.height, 1000);
      // Interrupted typing is restored, including geometry, from the local draft.
      await page.getByRole("navigation", { name: labels.tools }).getByRole("button", { name: labels.layers, exact: true }).click();
      await page.getByRole("button", { name: new RegExp(`01.*${labels.textLayer}`) }).filter({ visible: true }).click();
      await page.getByRole("button", { name: labels.editText, exact: true }).click();
      await field.fill("Draft recovery");
      await expect.poll(() => page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open("photo-platform-cosplan", 1); req.onsuccess = () => resolve(req.result); });
        return new Promise<string>((resolve) => { const req = db.transaction("drafts").objectStore("drafts").get("current"); req.onsuccess = () => { resolve(req.result?.layers?.[0]?.text); db.close(); }; });
      })).toBe("Draft recovery");
      await page.reload();
      await page.getByRole("button", { name: labels.restore, exact: true }).click();
      await page.getByRole("navigation", { name: labels.tools }).getByRole("button", { name: labels.layers, exact: true }).click();
      await page.getByRole("button", { name: new RegExp(`01.*${labels.textLayer}`) }).filter({ visible: true }).click();
      await page.getByRole("button", { name: labels.editText, exact: true }).click();
      assert.equal(await field.inputValue(), "Draft recovery");
      await page.getByRole("button", { name: labels.doneText, exact: true }).click();
      await page.getByRole("button", { name: labels.addText, exact: true }).filter({ visible: true }).click();
      await page.getByRole("button", { name: labels.cancelText, exact: true }).click();
      await page.getByRole("navigation", { name: labels.tools }).getByRole("button", { name: labels.layers, exact: true }).click();
      assert.equal(await page.getByRole("button", { name: new RegExp(labels.textLayer) }).filter({ visible: true }).count(), 1);
      await page.getByRole("navigation", { name: labels.tools }).getByRole("button", { name: labels.text, exact: true }).click();
      await page.getByRole("button", { name: labels.addText, exact: true }).filter({ visible: true }).click();
      await page.getByRole("button", { name: labels.doneText, exact: true }).click();
      await page.getByRole("navigation", { name: labels.tools }).getByRole("button", { name: labels.layers, exact: true }).click();
      assert.equal(await page.getByRole("button", { name: new RegExp(labels.textLayer) }).filter({ visible: true }).count(), 1);
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`PASS mobile inline editing, IME, rotation, cancel, undo, draft and PNG at ${width}px (${locale})`);
    }
    const desktop = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await desktop.goto(`http://127.0.0.1:${address.port}`);
    await desktop.getByRole("button", { name: /Test poster/ }).click();
    await desktop.getByRole("button", { name: "Add text", exact: true }).click();
    await desktop.getByRole("textbox", { name: "Content", exact: true }).fill("Desktop text");
    assert.equal(await desktop.getByRole("dialog").count(), 0);
    await desktop.close();
    console.log("PASS desktop keeps its existing text inspector");
  } finally { await browser.close(); server.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
