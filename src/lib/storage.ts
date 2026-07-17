import "server-only";
import { prisma } from "./db";
import {
  EFFECTIVE_QUOTA,
  EFFECTIVE_TIER_ID,
  getQuotaUsage,
  type QuotaUsage
} from "./quota";

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
  /** The allowance in force: the override if set, else the effective tier's. */
  quotaBytes: number;
  photoCount: number;
  /** The tier actually in force, expiry already applied. */
  tierName: string;
  /** What is assigned, which is not the same as what is in force once expired. */
  tierId: string | null;
  tierExpiresAt: Date | null;
  /** Assigned tier has lapsed; the default is in force. */
  expired: boolean;
  /** A per-account override is beating the tier. */
  overridden: boolean;
}

export interface PlatformStorage {
  accounts: PlatformAccountStorage[];
  totalUsedBytes: number;
  databaseBytes: number;
}

/**
 * Every account's usage, for the platform admin.
 *
 * Raw rather than findMany because an account's allowance is no longer a column
 * — it is an override, a tier and an expiry date resolved together. Reusing the
 * fragments from quota.ts means this page shows exactly the number the upload
 * check will enforce; reading User.quotaBytes directly would now show the
 * override alone, which is NULL for most accounts and would render as 0.
 */
export async function getPlatformStorage(): Promise<PlatformStorage> {
  const [rows, databaseBytes] = await Promise.all([
    prisma.$queryRaw<
      {
        id: string;
        username: string;
        displayName: string;
        usedBytes: bigint;
        quotaBytes: bigint;
        photoCount: number;
        tierName: string | null;
        tierId: string | null;
        tierExpiresAt: Date | null;
        expired: boolean;
        overridden: boolean;
      }[]
    >`
      SELECT
        u.id,
        u.username,
        u."displayName",
        u."usedBytes",
        ${EFFECTIVE_QUOTA} AS "quotaBytes",
        (SELECT t."name" FROM "Tier" t WHERE t.id = ${EFFECTIVE_TIER_ID}) AS "tierName",
        u."tierId",
        u."tierExpiresAt",
        (u."tierId" IS NOT NULL
          AND u."tierExpiresAt" IS NOT NULL
          AND u."tierExpiresAt" <= now()) AS "expired",
        (u."quotaBytes" IS NOT NULL) AS "overridden",
        (
          SELECT COUNT(*)::int
            FROM "Photo" p
            JOIN "Event" e ON e.id = p."eventId"
           WHERE e."ownerId" = u.id
        ) AS "photoCount"
      FROM "User" AS u
      ORDER BY u."createdAt" ASC
    `,
    databaseSize()
  ]);

  const accounts: PlatformAccountStorage[] = rows
    .map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      // BigInt cannot cross into a client component or JSON.stringify.
      usedBytes: Number(u.usedBytes),
      quotaBytes: Number(u.quotaBytes),
      photoCount: u.photoCount,
      tierName: u.tierName ?? "",
      tierId: u.tierId,
      tierExpiresAt: u.tierExpiresAt,
      expired: u.expired,
      overridden: u.overridden
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
