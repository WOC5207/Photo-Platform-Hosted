import "server-only";

import path from "node:path";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { cosplanCharacterCacheDir, trimCharacterCache } from "@/lib/cosplanStorage";
import { config } from "@/lib/config";
import { withImageProcessingSlot } from "@/lib/images";

const API_ROOT = "https://api.bgm.tv/v0";
const USER_AGENT = "Photo-Platform-Hosted/2.0 (Cosplan; https://github.com/WOC5207/Photo-Platform-Hosted)";
const SEARCH_TTL_MS = 10 * 60 * 1000;
const IMAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_DOWNLOAD_BYTES = 10 * 1024 * 1024;

export type BangumiCharacter = {
  id: number;
  name: string;
  nameCn: string;
  imageUrl: string;
  sourceUrl: string;
};

type SearchCacheEntry = { expiresAt: number; value: { items: BangumiCharacter[]; total: number } };
const searchCache = new Map<string, SearchCacheEntry>();
const imageImports = new Map<number, Promise<string>>();

function characterFrom(value: unknown): BangumiCharacter | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = Number(row.id);
  if (!Number.isInteger(id) || id <= 0 || typeof row.name !== "string") return null;
  const images = row.images && typeof row.images === "object" ? row.images as Record<string, unknown> : {};
  const rawImage = typeof images.medium === "string" ? images.medium : typeof images.large === "string" ? images.large : "";
  const imageUrl = rawImage ? allowedBangumiImageUrl(rawImage)?.toString() ?? "" : "";
  return {
    id,
    name: row.name,
    nameCn: typeof row.name_cn === "string" ? row.name_cn : "",
    imageUrl,
    sourceUrl: `https://bgm.tv/character/${id}`
  };
}

async function bangumiFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": USER_AGENT, ...init?.headers },
    signal: AbortSignal.timeout(6_000),
    cache: "no-store"
  });
}

export async function searchBangumiCharacters(query: string, page: number) {
  const keyword = query.trim().slice(0, 80);
  const safePage = Math.max(1, Math.min(50, page));
  const key = `${keyword.toLocaleLowerCase()}:${safePage}`;
  const cached = searchCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const response = await bangumiFetch(`${API_ROOT}/search/characters?limit=20&offset=${(safePage - 1) * 20}`, {
    method: "POST",
    body: JSON.stringify({ keyword, filter: { nsfw: false } })
  });
  if (!response.ok) throw new Error(`bangumiSearch:${response.status}`);
  const payload = await response.json() as Record<string, unknown>;
  const rows = Array.isArray(payload.data) ? payload.data : [];
  const value = {
    items: rows.map(characterFrom).filter((item): item is BangumiCharacter => Boolean(item)),
    total: Number.isFinite(Number(payload.total)) ? Number(payload.total) : rows.length
  };
  searchCache.set(key, { expiresAt: Date.now() + SEARCH_TTL_MS, value });
  if (searchCache.size > 500) {
    for (const [cacheKey, entry] of searchCache) if (entry.expiresAt <= Date.now()) searchCache.delete(cacheKey);
  }
  return value;
}

export function allowedBangumiImageUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.hostname !== "lain.bgm.tv" || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

async function downloadCharacterImage(characterId: number): Promise<Buffer> {
  const detailResponse = await bangumiFetch(`${API_ROOT}/characters/${characterId}`);
  if (!detailResponse.ok) throw new Error("characterNotFound");
  const detail = await detailResponse.json() as Record<string, unknown>;
  const character = characterFrom(detail);
  const source = character?.imageUrl ? allowedBangumiImageUrl(character.imageUrl) : null;
  if (!source) throw new Error("imageUnavailable");

  const imageResponse = await fetch(source, {
    headers: { Accept: "image/avif,image/webp,image/png,image/jpeg", "User-Agent": USER_AGENT },
    redirect: "error",
    signal: AbortSignal.timeout(8_000),
    cache: "no-store"
  });
  if (!imageResponse.ok) throw new Error("imageUnavailable");
  const declared = Number(imageResponse.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_DOWNLOAD_BYTES) throw new Error("imageTooLarge");
  const reader = imageResponse.body?.getReader();
  if (!reader) throw new Error("imageUnavailable");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_DOWNLOAD_BYTES) {
      await reader.cancel();
      throw new Error("imageTooLarge");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

async function importBangumiCharacterImage(characterId: number): Promise<string> {
  const dir = cosplanCharacterCacheDir();
  const filePath = path.join(dir, `${characterId}.webp`);
  const stat = await fs.stat(filePath).catch(() => null);
  if (stat && Date.now() - stat.mtimeMs < IMAGE_TTL_MS) return filePath;
  await fs.mkdir(dir, { recursive: true });
  const input = await downloadCharacterImage(characterId);
  const tempPath = path.join(dir, `.${characterId}-${randomUUID()}.tmp`);
  try {
    await withImageProcessingSlot(() =>
      sharp(input, { failOn: "warning", limitInputPixels: Math.min(config.imageMaxPixels(), 25_000_000), pages: 1 })
        .rotate()
        .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 90, alphaQuality: 100 })
        .toFile(tempPath)
    );
    await fs.rename(tempPath, filePath);
  } finally {
    await fs.rm(tempPath, { force: true }).catch(() => {});
  }
  void trimCharacterCache().catch(() => {});
  return filePath;
}

export async function getBangumiCharacterImage(characterId: number): Promise<string> {
  if (!Number.isInteger(characterId) || characterId <= 0) throw new Error("invalidCharacter");
  const existing = imageImports.get(characterId);
  if (existing) return existing;
  const work = importBangumiCharacterImage(characterId);
  imageImports.set(characterId, work);
  try {
    return await work;
  } finally {
    imageImports.delete(characterId);
  }
}
