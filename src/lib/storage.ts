import "server-only";
import { prisma } from "./db";
import { getQuotaUsage, type QuotaUsage } from "./quota";

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

export interface OwnerStorage extends QuotaUsage {
  photosBytes: number;
  siteImagesBytes: number;
  events: EventStorage[];
}

/**
 * One owner's usage, for their own dashboard.
 *
 * Summed from Photo.bytes and SiteImage.bytes rather than walked from disk.
 * This used to fs.stat every file on every page load — the docstring even said
 * there was no cheaper source of truth, which stopped being true once uploads
 * started recording their own size.
 *
 * The database's own size is deliberately absent: it is one shared Postgres for
 * the whole platform, so it is not any single owner's usage and does not count
 * against their quota.
 */
export async function getOwnerStorage(ownerId: string): Promise<OwnerStorage> {
  const [events, siteImages, usage] = await Promise.all([
    prisma.event.findMany({
      where: { ownerId },
      select: {
        id: true,
        titleEn: true,
        titleZh: true,
        _count: { select: { photos: true } },
        photos: { select: { bytes: true } }
      },
      orderBy: { createdAt: "asc" }
    }),
    prisma.siteImage.aggregate({
      where: { ownerId },
      _sum: { bytes: true }
    }),
    getQuotaUsage(ownerId)
  ]);

  const perEvent: EventStorage[] = events
    .map((e) => ({
      id: e.id,
      titleEn: e.titleEn,
      titleZh: e.titleZh,
      photoCount: e._count.photos,
      bytes: e.photos.reduce((sum, p) => sum + p.bytes, 0)
    }))
    .sort((a, b) => b.bytes - a.bytes);

  return {
    ...usage,
    photosBytes: perEvent.reduce((sum, e) => sum + e.bytes, 0),
    siteImagesBytes: siteImages._sum.bytes ?? 0,
    events: perEvent
  };
}

export interface PlatformAccountStorage {
  id: string;
  username: string;
  displayName: string;
  usedBytes: number;
  quotaBytes: number;
  photoCount: number;
}

export interface PlatformStorage {
  accounts: PlatformAccountStorage[];
  totalUsedBytes: number;
  databaseBytes: number;
}

/** Every account's usage, for the platform admin. */
export async function getPlatformStorage(): Promise<PlatformStorage> {
  const [users, databaseBytes] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        username: true,
        displayName: true,
        usedBytes: true,
        quotaBytes: true,
        events: { select: { _count: { select: { photos: true } } } }
      }
    }),
    databaseSize()
  ]);

  const accounts: PlatformAccountStorage[] = users
    .map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      // BigInt cannot cross into a client component or JSON.stringify.
      usedBytes: Number(u.usedBytes),
      quotaBytes: Number(u.quotaBytes),
      photoCount: u.events.reduce((n, e) => n + e._count.photos, 0)
    }))
    .sort((a, b) => b.usedBytes - a.usedBytes);

  return {
    accounts,
    totalUsedBytes: accounts.reduce((sum, a) => sum + a.usedBytes, 0),
    databaseBytes
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
