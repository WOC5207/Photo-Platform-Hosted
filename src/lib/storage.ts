import "server-only";
import path from "path";
import { promises as fs } from "fs";
import { config } from "./config";
import { prisma } from "./db";

async function dirSize(dir: string): Promise<number> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  let total = 0;
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await dirSize(full);
    } else if (entry.isFile()) {
      total += (await fs.stat(full)).size;
    }
  }
  return total;
}

// On-disk size of the whole database, including indexes and bloat. Ask
// Postgres rather than measuring files: the data lives in the db container's
// volume, which this process cannot see.
async function databaseSize(): Promise<number> {
  try {
    const rows = await prisma.$queryRaw<
      { size: bigint }[]
    >`SELECT pg_database_size(current_database()) AS size`;
    // pg_database_size returns bigint; Number is safe well past any plausible
    // size here (2^53 bytes = 9 PB) and the callers all expect number.
    return rows.length > 0 ? Number(rows[0].size) : 0;
  } catch (err) {
    console.error("Failed to read database size:", err);
    return 0;
  }
}

export interface EventStorage {
  id: string;
  titleEn: string;
  titleZh: string;
  photoCount: number;
  bytes: number;
}

export interface StorageStats {
  photosBytes: number;
  siteImagesBytes: number;
  databaseBytes: number;
  totalBytes: number;
  events: EventStorage[];
}

/**
 * Walks the photos directory (per event) and the site-images directory on
 * disk to report actual space used, and asks Postgres for its own size.
 * There's no cheaper source of truth for the files — nothing in the DB
 * tracks file sizes.
 */
export async function getStorageStats(): Promise<StorageStats> {
  const events = await prisma.event.findMany({
    select: {
      id: true,
      titleEn: true,
      titleZh: true,
      _count: { select: { photos: true } }
    },
    orderBy: { createdAt: "asc" }
  });

  const events_ = await Promise.all(
    events.map(async (e): Promise<EventStorage> => ({
      id: e.id,
      titleEn: e.titleEn,
      titleZh: e.titleZh,
      photoCount: e._count.photos,
      bytes: await dirSize(path.join(config.photosDir(), e.id))
    }))
  );
  events_.sort((a, b) => b.bytes - a.bytes);

  const [siteImagesBytes, databaseBytes] = await Promise.all([
    dirSize(path.join(config.photosDir(), "_site")),
    databaseSize()
  ]);
  const photosBytes = events_.reduce((sum, e) => sum + e.bytes, 0);

  return {
    photosBytes,
    siteImagesBytes,
    databaseBytes,
    totalBytes: photosBytes + siteImagesBytes + databaseBytes,
    events: events_
  };
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exp = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / 1024 ** exp;
  return `${exp === 0 ? value : value.toFixed(1)} ${units[exp]}`;
}
