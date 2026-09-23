/** Isolated browser fixture; no account, database, or external image requests. */
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";
import { createServer } from "node:http";
import assert from "node:assert/strict";
import sharp from "sharp";

async function main() {
  const bundle = await build({ entryPoints: ["scripts/fixtures/cosplan-mobile.tsx"], bundle: true, write: false, platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' } });
  const server = createServer((req, res) => {
    if (req.url === "/app.js") { res.setHeader("Content-Type", "text/javascript"); res.end(bundle.outputFiles[0].contents); }
    else if (req.url === "/background.svg") { res.setHeader("Content-Type", "image/svg+xml"); res.end('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="#112233"/></svg>'); }
    else { res.setHeader("Content-Type", "text/html"); res.end('<html><body><div id="root"></div><script src="/app.js"></script></body></html>'); }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/?names`);
    await page.getByRole("button", { name: /Test poster/ }).click();
    const png = await sharp({ create: { width: 100, height: 200, channels: 4, background: "#aa3333" } }).png().toBuffer();
    await page.locator('input[type="file"]').first().setInputFiles({ name: "Hatsune Miku.png", mimeType: "image/png", buffer: png });
    await page.getByRole("button", { name: /01.*Friday/ }).first().click();
    const names = () => page.evaluate(() => {
      const stage = (window as unknown as { testKonva: { stages: Array<{ find: (selector: string) => Array<{ text: () => string }> }> } }).testKonva.stages[0];
      return stage.find("Text").map((node) => node.text());
    });
    await expect.poll(names).toEqual(["Hatsune Miku"]);
    const longName = "初音未来 Hatsune Miku with a very long character name";
    await page.getByLabel("Character name", { exact: true }).first().fill(longName);
    await expect.poll(names).toEqual([longName]);
    const nameToggle = page.getByLabel("Show character name", { exact: true }).first();
    assert.equal(await nameToggle.isChecked(), true, "Character names start on");
    await nameToggle.uncheck();
    await expect.poll(names).toEqual([]);
    async function exportHasName() {
      const download = page.waitForEvent("download");
      await page.getByRole("button", { name: "Download PNG", exact: true }).first().click();
      const file = await (await download).path();
      assert.ok(file);
      const { data } = await sharp(file!).extract({ left: 50, top: 750, width: 300, height: 60 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      return data.some((value, index) => index % 3 === 0 && value > 220 && data[index + 1] > 220 && data[index + 2] > 220);
    }
    assert.equal(await exportHasName(), false, "The exported poster omits a hidden character name");
    await page.getByRole("button", { name: new RegExp(`01.*${longName}`) }).first().click();
    await nameToggle.check();
    await expect.poll(names).toEqual([longName]);
    assert.equal(await exportHasName(), true, "The exported poster includes the enabled character name");
    await page.getByRole("button", { name: new RegExp(`01.*${longName}`) }).first().click();
    await nameToggle.uncheck();
    await expect.poll(names).toEqual([]);
    await page.waitForTimeout(800); // Existing draft debounce.
    await page.reload();
    await page.getByRole("button", { name: "Restore draft", exact: true }).click();
    await expect.poll(names).toEqual([]);
    await page.getByRole("button", { name: new RegExp(`01.*${longName}`) }).first().click();
    await nameToggle.check();
    await expect.poll(names).toEqual([longName]);
    await page.getByRole("button", { name: "Delete", exact: true }).first().click();
    await expect.poll(names).toEqual([]);
    await page.getByRole("button", { name: "Undo", exact: true }).first().click();
    await expect.poll(names).toEqual([longName]);
    await page.getByRole("button", { name: new RegExp(`01.*${longName}`) }).first().click();
    await nameToggle.uncheck();
    await expect.poll(names).toEqual([]);
    await page.getByRole("button", { name: "Undo", exact: true }).first().click();
    await expect.poll(names).toEqual([longName]);
    assert.deepEqual(errors, []);
    console.log("PASS  default-on character names, visitor visibility, PNG export, deletion, undo, and draft restoration in Chrome");
  } finally {
    await browser.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
