import "server-only";
import path from "path";
import { setTimeout as sleep } from "timers/promises";
import { prisma } from "./db";
import { config } from "./config";
import { eventDir, withImageProcessingSlot } from "./images";
import {
  SUBJECT_DETECTION_VERSION,
  detectSubjectFromFile,
  photoNeedsSubject,
  type SubjectDetectionResult
} from "./subjectDetection";

/**
 * Runs subject detection for photos that do not have a current result and
 * stores it on the Photo row. New uploads get theirs inside the compression
 * job; this covers photos that existed before detection did, and any row a
 * poster asks for that is still missing one.
 *
 * Writes are conditional and idempotent (the result is deterministic), so two
 * instances doing the same photo is harmless and no claim column is needed.
 * All decoding goes through the single image-processing slot, so uploads and
 * compression keep priority on the NAS.
 */

/** Photos to detect on demand; bounded so a busy picker cannot pile up work. */
const QUEUE_LIMIT = 64;
const ON_DEMAND_PAUSE_MS = 150;
const SWEEP_START_DELAY_MS = 20_000;
const SWEEP_PAUSE_MS = 250;

const queued = new Set<string>();
const order: string[] = [];
let draining = false;

async function detect(medPath: string): Promise<SubjectDetectionResult> {
  try {
    return await withImageProcessingSlot(() => detectSubjectFromFile(medPath));
  } catch (error) {
    // A file that cannot be decoded still gets a version stamp so the sweep
    // does not retry it every boot.
    console.error("Subject detection failed:", error);
    return { version: SUBJECT_DETECTION_VERSION, subject: null };
  }
}

export async function ensurePhotoSubject(photoId: string): Promise<void> {
  const row = await prisma.photo.findUnique({
    where: { id: photoId },
    select: {
      id: true,
      eventId: true,
      uploadState: true,
      subjectVersion: true,
      event: { select: { ownerId: true } }
    }
  });
  if (!row || row.uploadState !== "ready" || !photoNeedsSubject(row)) return;
  const medPath = path.join(eventDir(row.event.ownerId, row.eventId), `${row.id}-med.webp`);
  const result = await detect(medPath);
  const subject = result.subject;
  await prisma.$executeRaw`
    UPDATE "Photo"
       SET "subjectX" = ${subject?.x ?? null},
           "subjectY" = ${subject?.y ?? null},
           "subjectBoxX" = ${subject?.box.x ?? null},
           "subjectBoxY" = ${subject?.box.y ?? null},
           "subjectBoxWidth" = ${subject?.box.width ?? null},
           "subjectBoxHeight" = ${subject?.box.height ?? null},
           "subjectVersion" = ${result.version}
     WHERE id = ${row.id}
       AND ("subjectVersion" IS NULL OR "subjectVersion" < ${result.version})
  `;
}

async function drain(): Promise<void> {
  draining = true;
  try {
    while (order.length > 0) {
      const id = order.shift()!;
      try {
        await ensurePhotoSubject(id);
      } catch (error) {
        console.error("On-demand subject detection failed:", error);
      } finally {
        queued.delete(id);
      }
      await sleep(ON_DEMAND_PAUSE_MS);
    }
  } finally {
    draining = false;
  }
}

/**
 * Fire-and-forget: never awaited by request handlers, so a poster page is
 * never delayed. Extras beyond the queue limit are dropped; the next page load
 * asks again.
 */
export function requestPhotoSubjects(photoIds: string[]): void {
  for (const id of photoIds) {
    if (queued.has(id) || order.length >= QUEUE_LIMIT) continue;
    queued.add(id);
    order.push(id);
  }
  if (!draining && order.length > 0) void drain();
}

/**
 * Boot-time backfill, newest photos first since they are the likeliest to be
 * used in posters. Waits for the compression sweep's burst to pass, then
 * works sequentially with a pause between photos.
 */
export async function sweepPhotoSubjects(): Promise<void> {
  if (!config.subjectDetectionSweep()) return;
  await sleep(SWEEP_START_DELAY_MS);
  let rows: { id: string }[] = [];
  try {
    rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Photo"
       WHERE "uploadState" = 'ready'
         AND ("subjectVersion" IS NULL OR "subjectVersion" < ${SUBJECT_DETECTION_VERSION})
       ORDER BY "createdAt" DESC
    `;
  } catch (error) {
    console.error("Failed to list photos for subject detection:", error);
    return;
  }
  for (const row of rows) {
    try {
      await ensurePhotoSubject(row.id);
    } catch (error) {
      console.error("Subject detection sweep failed for a photo:", error);
    }
    await sleep(SWEEP_PAUSE_MS);
  }
}
