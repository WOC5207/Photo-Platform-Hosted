import "server-only";
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
  const updated = await prisma.$executeRaw`
    UPDATE "User"
       SET "usedBytes" = "usedBytes" + ${BigInt(bytes)}
     WHERE id = ${userId}
       AND "usedBytes" + ${BigInt(bytes)} <= "quotaBytes"
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
  quotaBytes: number;
}

/** Current usage for display. Converts BigInt at the boundary — see below. */
export async function getQuotaUsage(userId: string): Promise<QuotaUsage> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { usedBytes: true, quotaBytes: true }
  });
  return {
    // BigInt cannot cross into a client component or JSON.stringify, so it is
    // converted here rather than at each call site. Number is exact to 2^53
    // bytes (9 PB), which is not a limit anyone will meet on a NAS.
    usedBytes: Number(user?.usedBytes ?? 0),
    quotaBytes: Number(user?.quotaBytes ?? 0)
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
  const [photos, siteImages] = await Promise.all([
    prisma.photo.aggregate({
      where: { event: { ownerId: userId } },
      _sum: { bytes: true }
    }),
    prisma.siteImage.aggregate({
      where: { ownerId: userId },
      _sum: { bytes: true }
    })
  ]);
  const total = (photos._sum.bytes ?? 0) + (siteImages._sum.bytes ?? 0);
  await prisma.user.update({
    where: { id: userId },
    data: { usedBytes: BigInt(total) }
  });
  return getQuotaUsage(userId);
}
