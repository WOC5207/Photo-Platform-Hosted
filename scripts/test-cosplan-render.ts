/**
 * The 3D site paints Cosplan posters with lib/cosplanCanvas instead of
 * Konva. This downloads one draft from the classic editor and paints it with
 * the 3D painter in the same browser, then compares the two PNGs.
 * Browser-only fixture: no database, account or provider requests.
 */
import { build } from "esbuild";
import { chromium, type Browser } from "@playwright/test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import sharp from "sharp";

const background =
  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><defs><linearGradient id="g" x2="0" y2="1"><stop offset="0" stop-color="#143359"/><stop offset="1" stop-color="#3a1d4f"/></linearGradient></defs><rect width="800" height="1000" fill="url(#g)"/><path d="M0 120L800 20M0 520L800 410M0 920L800 810" stroke="#2f6ea3" stroke-width="60" opacity=".5"/><g fill="#fff"><rect x="40" y="160" width="340" height="620"/><rect x="420" y="160" width="340" height="620"/></g></svg>';

async function launch(): Promise<Browser> {
  // CI has Chrome; elsewhere CHROMIUM_PATH can name a local Chromium.
  if (process.env.CHROMIUM_PATH) return chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true });
  return chromium.launch({ channel: "chrome", headless: true });
}

async function main() {
  const bundle = await build({ entryPoints: ["scripts/fixtures/cosplan-render.tsx"], bundle: true, write: false, platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' } });
  // A frame over the slots: opaque border and labels, transparent openings.
  const foreground = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><path fill-rule="evenodd" fill="#d9b25f" d="M30 150H770V790H30ZM40 160V780H380V160ZM420 160V780H760V160Z"/><text x="400" y="975" fill="#d9b25f" font-family="Arial" font-size="20" text-anchor="middle">FOREGROUND</text></svg>')).png().toBuffer();
  const server = createServer((req, res) => {
    if (req.url === "/app.js") {
      res.setHeader("Content-Type", "text/javascript");
      res.end(bundle.outputFiles[0].contents);
    } else if (req.url === "/background.svg") {
      res.setHeader("Content-Type", "image/svg+xml");
      res.end(background);
    } else if (req.url === "/foreground.png") {
      res.setHeader("Content-Type", "image/png");
      res.end(foreground);
    } else {
      res.setHeader("Content-Type", "text/html");
      res.end('<html><body><div id="root"></div><script src="/app.js"></script></body></html>');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/`);
    await page.evaluate(() => (window as unknown as { fixture: { seed(): Promise<void> } }).fixture.seed());
    await page.reload();
    await page.getByRole("button", { name: "Restore draft", exact: true }).click();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download PNG", exact: true }).first().click();
    const konvaFile = await (await download).path();
    assert.ok(konvaFile, "The classic editor downloads a PNG");
    const painted = Buffer.from(await page.evaluate(() => (window as unknown as { fixture: { paint(): Promise<string> } }).fixture.paint()), "base64");

    const konva = sharp(konvaFile!);
    const konvaMeta = await konva.metadata();
    const paintedMeta = await sharp(painted).metadata();
    assert.equal(paintedMeta.width, 800, "The painted poster is the background's width");
    assert.equal(paintedMeta.height, 1000, "The painted poster is the background's height");
    // Konva sizes its export canvas as width × scale × (1 / scale), which can land a pixel short.
    assert.ok(Math.abs((konvaMeta.width ?? 0) - 800) <= 1 && Math.abs((konvaMeta.height ?? 0) - 1000) <= 1, `Konva export is ${konvaMeta.width}×${konvaMeta.height}`);
    const width = Math.min(konvaMeta.width!, 800);
    const height = Math.min(konvaMeta.height!, 1000);
    const region = { left: 0, top: 0, width, height };
    const a = await konva.extract(region).removeAlpha().raw().toBuffer();
    const b = await sharp(painted).extract(region).removeAlpha().raw().toBuffer();
    let total = 0;
    let off = 0;
    for (let i = 0; i < a.length; i += 3) {
      const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
      total += d;
      if (d > 48) off += 1;
    }
    const pixels = a.length / 3;
    const mean = total / pixels;
    const offShare = off / pixels;
    console.log(`Cosplan render: mean channel difference ${mean.toFixed(3)}, ${(offShare * 100).toFixed(3)}% of pixels differ by more than 48`);
    if (process.env.COSPLAN_RENDER_OUT) {
      await sharp(konvaFile!).toFile(`${process.env.COSPLAN_RENDER_OUT}/konva.png`);
      await sharp(painted).toFile(`${process.env.COSPLAN_RENDER_OUT}/painted.png`);
    }
    assert.ok(mean < 0.5, "The painted poster matches the classic download on average");
    assert.ok(offShare < 0.001, "Under 0.1% of pixels differ visibly from the classic download");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
}

main().then(
  () => console.log("Cosplan render checks passed"),
  (error) => {
    console.error(error);
    process.exit(1);
  }
);
