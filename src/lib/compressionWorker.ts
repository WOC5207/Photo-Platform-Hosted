import "server-only";
import { prisma } from "./db";
import { config } from "./config";
import {
  compressPendingMaster,
  isStoragePreset,
  withImageProcessingSlot,
  type CandidatePreset,
  type StoragePreset
} from "./images";

/**
 * Background compression for pending uploads.
 *
 * POST stores the source and thumbnail and leaves the row in "processing";
 * this worker produces the remaining renditions and the compressed master, then
 * flips the row to "pending". A quality change (PUT) puts the row back into
 * "processing" and re-runs this worker.
 *
 * Correctness across app instances rests on a durable claim: compressionClaimedAt
 * is stamped by a single conditional UPDATE, so exactly one worker owns a row.
 * A claim older than config.compressionClaimStaleMs is considered abandoned
 * (worker crashed mid-compress) and may be reclaimed — by a retry or the
 * startup sweep.
 */

interface ClaimedPhoto {
  id: string;
  eventId: string;
  ownerId: string;
  storagePreset: string;
  candidatePreset: string | null;
  sourceFilename: string | null;
  bytes: number;
}

/** The candidate quality to encode for a given selected master. */
function targetCandidatePreset(
  storagePreset: StoragePreset,
  candidatePreset: string | null
): CandidatePreset {
  if (storagePreset === "archive" || storagePreset === "balanced") {
    return storagePreset;
  }
  // "original" keeps a compressed comparison candidate so the wizard can still
  // show savings; reuse the existing choice, defaulting to balanced.
  return candidatePreset === "archive" ? "archive" : "balanced";
}

/**
 * Atomically claim one processing row for compression. Returns null when the
 * row is missing, no longer processing, or already held by a live worker.
 */
async function claimPhoto(photoId: string): Promise<ClaimedPhoto | null> {
  const threshold = new Date(Date.now() - config.compressionClaimStaleMs());
  const rows = await prisma.$queryRaw<ClaimedPhoto[]>`
    UPDATE "Photo" AS p
       SET "compressionClaimedAt" = now(),
           "compressionFailed" = false
      FROM "Event" AS e
     WHERE p.id = ${photoId}
       AND p."eventId" = e.id
       AND p."uploadState" = 'processing'
       AND p."pendingBatchId" IS NOT NULL
       AND (p."compressionClaimedAt" IS NULL OR p."compressionClaimedAt" < ${threshold})
    RETURNING
      p.id,
      p."eventId",
      e."ownerId",
      p."storagePreset",
      p."candidatePreset",
      p."sourceFilename",
      p.bytes
  `;
  return rows[0] ?? null;
}

async function markCompressionFailed(photoId: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "Photo"
       SET "compressionFailed" = true,
           "compressionClaimedAt" = NULL
     WHERE id = ${photoId} AND "uploadState" = 'processing'
  `;
}

/**
 * Run (or re-run) compression for one pending photo. Safe to call more than
 * once and from more than one instance: the claim guarantees a single owner,
 * and compressPendingMaster is idempotent on disk.
 */
export async function runCompressionJob(photoId: string): Promise<void> {
  let claimed: ClaimedPhoto | null;
  try {
    claimed = await claimPhoto(photoId);
  } catch (err) {
    console.error("Failed to claim pending photo for compression:", err);
    return;
  }
  if (!claimed) return;

  if (!claimed.sourceFilename || !isStoragePreset(claimed.storagePreset)) {
    await markCompressionFailed(photoId).catch(() => undefined);
    return;
  }
  const storagePreset = claimed.storagePreset;
  const target = targetCandidatePreset(storagePreset, claimed.candidatePreset);

  try {
    const result = await withImageProcessingSlot(() =>
      compressPendingMaster(
        claimed!.ownerId,
        claimed!.eventId,
        claimed!.id,
        claimed!.sourceFilename!,
        target
      )
    );

    const rerun = await prisma.$transaction(async (tx) => {
      // Lock the user before adjusting pendingBytes, the same ordering every
      // pending transition uses so reconcile never sees a half-update.
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${claimed!.ownerId} FOR UPDATE`;
      const rows = await tx.$queryRaw<
        { bytes: number; uploadState: string; storagePreset: string }[]
      >`
        SELECT bytes, "uploadState", "storagePreset"
          FROM "Photo" WHERE id = ${photoId} FOR UPDATE
      `;
      const row = rows[0];
      // Discarded or already advanced while we were encoding: leave it be. The
      // written files are cleaned up by the discard path's photo-id sweep.
      if (!row || row.uploadState !== "processing") return false;
      // The quality was changed while we were encoding: our output is stale.
      // Release the claim and re-run for the newly-chosen preset.
      if (row.storagePreset !== storagePreset) {
        await tx.$executeRaw`
          UPDATE "Photo" SET "compressionClaimedAt" = NULL
           WHERE id = ${photoId} AND "uploadState" = 'processing'
        `;
        return true;
      }

      const newBytes =
        result.sourceBytes + result.renditionBytes + result.candidateBytes;
      const delta = newBytes - row.bytes;
      if (delta !== 0) {
        await tx.$executeRaw`
          UPDATE "User"
             SET "pendingBytes" = GREATEST(0, "pendingBytes" + ${BigInt(delta)})
           WHERE id = ${claimed!.ownerId}
        `;
      }
      await tx.$executeRaw`
        UPDATE "Photo"
           SET "uploadState" = 'pending',
               filename = ${result.origFilename},
               "storagePreset" = ${storagePreset},
               "candidatePreset" = ${result.candidatePreset},
               "candidateBytes" = ${result.candidateBytes},
               "renditionBytes" = ${result.renditionBytes},
               "sourceBytes" = ${result.sourceBytes},
               bytes = ${newBytes},
               "compressionClaimedAt" = NULL,
               "compressionFailed" = false
         WHERE id = ${photoId} AND "uploadState" = 'processing'
      `;
      return false;
    });

    if (rerun) await runCompressionJob(photoId);
  } catch (err) {
    console.error("Background compression failed:", err);
    await markCompressionFailed(photoId).catch(() => undefined);
  }
}

/** Fire-and-forget wrapper: kicks compression without blocking the caller. */
export function enqueueCompression(photoId: string): void {
  void runCompressionJob(photoId);
}

/**
 * Resume compression for rows left "processing" by a crash. Called once at
 * startup. Only rows with no live claim are re-enqueued; runCompressionJob's
 * claim handles any race with a concurrently-started instance.
 */
export async function sweepPendingCompression(): Promise<void> {
  const threshold = new Date(Date.now() - config.compressionClaimStaleMs());
  let rows: { id: string }[] = [];
  try {
    rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Photo"
       WHERE "uploadState" = 'processing'
         AND "pendingBatchId" IS NOT NULL
         AND "sourceFilename" IS NOT NULL
         AND ("compressionClaimedAt" IS NULL OR "compressionClaimedAt" < ${threshold})
       ORDER BY "createdAt" ASC
    `;
  } catch (err) {
    console.error("Failed to sweep pending compression:", err);
    return;
  }
  for (const row of rows) {
    // Sequential: withImageProcessingSlot bounds the actual Sharp work anyway,
    // and this keeps the startup burst gentle on the NAS.
    await runCompressionJob(row.id);
  }
}
