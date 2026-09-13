import "server-only";

import path from "node:path";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import sharp from "sharp";
import { config } from "@/lib/config";
import { withImageProcessingSlot } from "@/lib/images";
import type { CosplanSlot } from "@/lib/cosplanTypes";

const TOKEN_PATTERN = /^cosplan[a-f0-9]{32}$/;

export function cosplanRoot(): string {
  return path.join(config.photosDir(), "platform", "cosplan");
}

export function cosplanTemplateDir(): string {
  return path.join(cosplanRoot(), "templates");
}

export function cosplanCharacterCacheDir(): string {
  return path.join(cosplanRoot(), "character-cache");
}

export function cosplanTemplatePath(token: string): string | null {
  if (!TOKEN_PATTERN.test(token)) return null;
  return path.join(cosplanTemplateDir(), `${token}.webp`);
}

export function cosplanTemplateUrl(token: string): string {
  return `/api/cosplan/templates/${token}`;
}

export function validCosplanDimensions(width: number, height: number): boolean {
  return (
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    width >= 320 &&
    height >= 320 &&
    width <= 4096 &&
    height <= 4096 &&
    width * height <= 12_000_000
  );
}

export async function storeCosplanTemplate(
  input: string,
  width: number,
  height: number
): Promise<{ token: string; bytes: number }> {
  if (!validCosplanDimensions(width, height)) throw new Error("invalidDimensions");
  const dir = cosplanTemplateDir();
  await fs.mkdir(dir, { recursive: true });
  const token = `cosplan${randomUUID().replace(/-/g, "")}`;
  const filePath = path.join(dir, `${token}.webp`);
  const output = await withImageProcessingSlot(() =>
    sharp(input, { failOn: "warning", limitInputPixels: config.imageMaxPixels(), pages: 1 })
      .rotate()
      .resize({ width, height, fit: "cover", position: "centre" })
      .webp({ quality: 90, alphaQuality: 100 })
      .toFile(filePath)
  );
  return { token, bytes: output.size };
}

export async function storeCosplanForeground(
  input: string,
  width: number,
  height: number
): Promise<{ token: string; bytes: number }> {
  if (!validCosplanDimensions(width, height)) throw new Error("invalidDimensions");
  const dir = cosplanTemplateDir();
  await fs.mkdir(dir, { recursive: true });
  const token = `cosplan${randomUUID().replace(/-/g, "")}`;
  const filePath = path.join(dir, `${token}.webp`);
  const output = await withImageProcessingSlot(() =>
    sharp(input, { failOn: "warning", limitInputPixels: config.imageMaxPixels(), pages: 1 })
      .rotate()
      .resize({ width, height, fit: "fill" })
      .ensureAlpha()
      .webp({ quality: 92, alphaQuality: 100 })
      .toFile(filePath)
  );
  return { token, bytes: output.size };
}

/**
 * Builds an immutable foreground from the current full poster by cutting out
 * every character slot. The original remains below the characters, so white
 * slot stock stays visible while borders and labels outside the openings sit
 * above them.
 */
export async function generateCosplanForeground(
  backgroundToken: string,
  width: number,
  height: number,
  slots: CosplanSlot[]
): Promise<{ token: string; bytes: number }> {
  if (!validCosplanDimensions(width, height) || slots.length === 0) throw new Error("invalidLayout");
  const backgroundPath = cosplanTemplatePath(backgroundToken);
  if (!backgroundPath) throw new Error("invalidBackground");
  const dir = cosplanTemplateDir();
  await fs.mkdir(dir, { recursive: true });
  const token = `cosplan${randomUUID().replace(/-/g, "")}`;
  const filePath = path.join(dir, `${token}.webp`);
  const output = await withImageProcessingSlot(async () => {
    const masks = await Promise.all(
      slots.map((slot) => {
        const mask = slot.shape
          ? sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${slot.width}" height="${slot.height}" viewBox="0 0 ${slot.width} ${slot.height}"><path d="${slot.shape.contours.map((contour) => contour.map((point, index) => `${index ? "L" : "M"}${(point.x * slot.width).toFixed(3)} ${(point.y * slot.height).toFixed(3)}`).join(" ") + " Z").join(" ")}" fill="white" fill-rule="evenodd"/></svg>`))
          : sharp({
              create: {
                width: slot.width,
                height: slot.height,
                channels: 4,
                background: { r: 255, g: 255, b: 255, alpha: 1 }
              }
            });
        return mask
          .png()
          .toBuffer()
          .then((input) => ({ input, left: slot.x, top: slot.y, blend: "dest-out" as const }));
      })
    );
    return sharp(backgroundPath, { failOn: "warning", limitInputPixels: config.imageMaxPixels(), pages: 1 })
      .resize({ width, height, fit: "fill" })
      .ensureAlpha()
      .composite(masks)
      .webp({ quality: 92, alphaQuality: 100 })
      .toFile(filePath);
  });
  return { token, bytes: output.size };
}

export async function deleteCosplanTemplateAssets(tokens: string[]): Promise<void> {
  await Promise.all(
    tokens.map(async (token) => {
      const filePath = cosplanTemplatePath(token);
      if (filePath) await fs.rm(filePath, { force: true }).catch(() => {});
    })
  );
}

export async function trimCharacterCache(
  maxBytes = 512 * 1024 * 1024,
  maxAgeMs = 7 * 24 * 60 * 60 * 1000
): Promise<void> {
  const dir = cosplanCharacterCacheDir();
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = (
    await Promise.all(
      entries
        .filter((entry) => entry.isFile() && /^\d+\.webp$/.test(entry.name))
        .map(async (entry) => {
          const filePath = path.join(dir, entry.name);
          const stat = await fs.stat(filePath);
          return { filePath, size: stat.size, mtimeMs: stat.mtimeMs };
        })
    )
  ).sort((a, b) => a.mtimeMs - b.mtimeMs);
  let total = files.reduce((sum, file) => sum + file.size, 0);
  const expiredBefore = Date.now() - maxAgeMs;
  for (const file of files) {
    if (file.mtimeMs >= expiredBefore && total <= maxBytes) break;
    await fs.rm(file.filePath, { force: true });
    total -= file.size;
  }
}
