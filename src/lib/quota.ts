import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";

/**
 * Per-account storage quota.
 *
 * The counter (User.usedBytes) is denormalised on purpose. An aggregate would
 * be both incomplete — quota covers site images too, so it is two SUMs across
 * two tables — and, more importantly, not atomic: SUM -> compare -> insert has
 * a window where two concurrent uploads both read 4.9GB, both pass a 5GB check,
 * and both write. PhotoUploader uploads one file at a time, but that is a
 * client-side property; two browser tabs defeat it.
 *
 * A counter lets the check and the reservation be one row-locked statement, so
 * the answer cannot be stale by the time it is acted on. That is the same
 * guarantee SQLite used to give the whole app for free, asked for explicitly.
 *
 * The trade is drift, which reconcile() corrects and the admin storage page
 * exposes as a button.
 */

/**
 * Which tier an account is actually on, right now.
 *
 * Expiry is resolved here, at read time, rather than by a job that rewrites
 * rows on a schedule: there is no scheduler in this app, and adding one would
 * mean the answer could be wrong whenever it failed to run. This expression
 * cannot be stale — the moment tierExpiresAt passes, every read returns the
 * default tier, with nothing having had to happen.
 *
 * Exported so every caller that needs an allowance uses this one expression.
 * Assumes the surrounding query aliases "User" as u.
 */
export const EFFECTIVE_TIER_ID = Prisma.sql`
  CASE
    WHEN u."tierId" IS NOT NULL
     AND (u."tierExpiresAt" IS NULL OR u."tierExpiresAt" > now())
    THEN u."tierId"
    ELSE (SELECT d.id FROM "Tier" d WHERE d."isDefault" LIMIT 1)
  END`;

/**
 * Number of accounts whose effective tier is each tier right now.
 *
 * This deliberately does not use Prisma's Tier.users relation count. A NULL
 * User.tierId means "follow the default tier", while an expired assignment
 * also falls back to the default without rewriting the row. Counting the
 * physical foreign key would therefore omit every inherited-default account
 * and keep counting expired assignments against their old tier.
 */
export async function getEffectiveTierAccountCounts(): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<
    { tierId: string | null; accountCount: number }[]
  >`
    SELECT effective."tierId", COUNT(*)::int AS "accountCount"
      FROM (
        SELECT ${EFFECTIVE_TIER_ID} AS "tierId"
          FROM "User" AS u
      ) AS effective
     WHERE effective."tierId" IS NOT NULL
     GROUP BY effective."tierId"
  `;

  return new Map(
    rows
      .filter((row): row is { tierId: string; accountCount: number } => Boolean(row.tierId))
      .map((row) => [row.tierId, row.accountCount])
  );
}

/**
 * The allowance an account actually has: its own override if it has one, else
 * whatever its effective tier grants.
 *
 * This exists as SQL, once, because reserveBytes has to check and claim in a
 * single statement — the whole point of the counter. Anything computed in
 * TypeScript and passed in would be a value read at one moment and acted on at
 * another, which is precisely the race this is built to avoid. Reads use the
 * same expression so that what an account is shown and what it is held to can
 * never disagree.
 *
 * Falls back to 0 — refuse everything — if no default tier exists. That state
 * should be unreachable (the migration seeds one, and the actions refuse to
 * delete or un-default the last), but if it ever happens, failing closed beats
 * handing out unlimited storage.
 */
export const EFFECTIVE_QUOTA = Prisma.sql`
  COALESCE(
    u."quotaBytes",
    (SELECT t."quotaBytes" FROM "Tier" t WHERE t.id = ${EFFECTIVE_TIER_ID}),
    0
  )`;

/**
 * Atomically claim `bytes` against the user's remaining allowance.
 *
 * Returns false if it would exceed the quota, having changed nothing. The
 * WHERE clause carries the check, so the decision and the write are the same
 * statement — there is no moment in between for another upload to slip through.
 */
export async function reserveBytes(
  userId: string,
  bytes: number
): Promise<boolean> {
  if (bytes <= 0) return true;
  // Still exactly one statement, even though the allowance now comes from a
  // tier, an override, and an expiry date. Resolving those in TypeScript first
  // would reopen the read-then-write window this whole design exists to close:
  // the tier could be reassigned, or the expiry pass, between the read and the
  // update. In here, the check and the claim see one consistent snapshot.
  const updated = await prisma.$executeRaw`
    UPDATE "User" AS u
       SET "usedBytes" = u."usedBytes" + ${BigInt(bytes)}
     WHERE u.id = ${userId}
       AND u."usedBytes" + ${BigInt(bytes)} <= ${EFFECTIVE_QUOTA}
  `;
  return updated === 1;
}

/**
 * Hand bytes back — a failed upload, or a deletion.
 *
 * Clamped at zero: a counter that has drifted low must not go negative and
 * silently hand out free space. GREATEST is in the statement rather than a
 * read-then-write for the same reason reserve is.
 */
export async function releaseBytes(userId: string, bytes: number): Promise<void> {
  if (bytes <= 0) return;
  await prisma.$executeRaw`
    UPDATE "User"
       SET "usedBytes" = GREATEST(0, "usedBytes" - ${BigInt(bytes)})
     WHERE id = ${userId}
  `;
}

/**
 * Correct a reservation once the real size is known.
 *
 * Uploads reserve an estimate before writing anything (the check has to precede
 * the disk write, or an over-quota user can still fill the disk), then true it
 * up here. Deliberately NOT re-checked against the quota: the bytes are already
 * on disk, and refusing now would leave the counter disagreeing with reality.
 * A small overshoot is corrected on the next delete or reconcile.
 */
export async function adjustReservation(
  userId: string,
  reserved: number,
  actual: number
): Promise<void> {
  const delta = actual - reserved;
  if (delta === 0) return;
  if (delta > 0) {
    await prisma.$executeRaw`
      UPDATE "User" SET "usedBytes" = "usedBytes" + ${BigInt(delta)} WHERE id = ${userId}
    `;
  } else {
    await releaseBytes(userId, -delta);
  }
}

export interface QuotaUsage {
  usedBytes: number;
  /** The allowance actually in force — override, or effective tier's. */
  quotaBytes: number;
  /** Name of the tier in force. Already accounts for expiry. */
  tierName: string;
  /** True when a per-account override is overriding the tier's allowance. */
  overridden: boolean;
  /** When the assignment lapses. Null = it does not. */
  tierExpiresAt: Date | null;
  /** True when the assignment has lapsed and the default tier is in force. */
  expired: boolean;
}

/**
 * Current usage and allowance for display.
 *
 * Raw rather than a findUnique so the allowance comes from the SAME expression
 * the upload check uses. Computing it again in TypeScript would be a second
 * implementation of one rule, free to drift from the first — and the way you
 * would find out is a photographer being refused an upload the page told them
 * would fit.
 */
export async function getQuotaUsage(userId: string): Promise<QuotaUsage> {
  const rows = await prisma.$queryRaw<
    {
      usedBytes: bigint;
      quotaBytes: bigint;
      tierName: string | null;
      overridden: boolean;
      tierExpiresAt: Date | null;
      expired: boolean;
    }[]
  >`
    SELECT
      u."usedBytes",
      ${EFFECTIVE_QUOTA} AS "quotaBytes",
      (SELECT t."name" FROM "Tier" t WHERE t.id = ${EFFECTIVE_TIER_ID}) AS "tierName",
      (u."quotaBytes" IS NOT NULL) AS "overridden",
      u."tierExpiresAt",
      (u."tierId" IS NOT NULL
        AND u."tierExpiresAt" IS NOT NULL
        AND u."tierExpiresAt" <= now()) AS "expired"
    FROM "User" AS u
    WHERE u.id = ${userId}
  `;
  const row = rows[0];
  return {
    // BigInt cannot cross into a client component or JSON.stringify, so it is
    // converted here rather than at each call site. Number is exact to 2^53
    // bytes (9 PB), which is not a limit anyone will meet on a NAS.
    usedBytes: Number(row?.usedBytes ?? 0),
    quotaBytes: Number(row?.quotaBytes ?? 0),
    tierName: row?.tierName ?? "",
    overridden: row?.overridden ?? false,
    tierExpiresAt: row?.tierExpiresAt ?? null,
    expired: row?.expired ?? false
  };
}

/**
 * Recompute usedBytes from what is actually recorded, and overwrite the
 * counter.
 *
 * The escape hatch for drift: a crash between reserving and truing up, a file
 * removed by hand, a bug. Sums the rows rather than walking the disk, so it
 * corrects the counter against the database's own view — cheap, and safe to run
 * any time.
 */
export async function reconcileQuota(userId: string): Promise<QuotaUsage> {
  await prisma.$transaction(async (tx) => {
    // Every pending-photo reservation/finalize/discard transition locks this
    // same row before changing the Photo record that the aggregate sees. Taking
    // it first prevents reconcile from observing one side of a transition and
    // then overwriting the counter after the other side commits.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const [photos, siteImages] = await Promise.all([
      tx.photo.aggregate({
        where: { event: { ownerId: userId } },
        _sum: { bytes: true }
      }),
      tx.siteImage.aggregate({
        where: { ownerId: userId },
        _sum: { bytes: true }
      })
    ]);
    const total = (photos._sum.bytes ?? 0) + (siteImages._sum.bytes ?? 0);
    await tx.user.update({
      where: { id: userId },
      data: { usedBytes: BigInt(total) }
    });
  });
  return getQuotaUsage(userId);
}
