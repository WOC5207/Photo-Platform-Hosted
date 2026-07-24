import "server-only";
import { promises as fs } from "fs";
import path from "path";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { config } from "./config";
import { eventDir } from "./images";
import { moderateImage } from "./moderationClient";
import {
  MODERATION_MODEL,
  evaluateModeration,
  isModerationThresholds
} from "./moderationPolicy";

interface ClaimedModerationPhoto {
  id: string;
  eventId: string;
  ownerId: string;
  moderationPolicyVersion: number | null;
  moderationThresholds: unknown;
  moderationAttempts: number;
  moderationClaimedAt: Date;
}

let activeModerationJobs = 0;
const moderationWaiters: Array<() => void> = [];
const scheduled = new Map<string, ReturnType<typeof setTimeout>>();

async function withModerationSlot<T>(work: () => Promise<T>): Promise<T> {
  if (activeModerationJobs >= config.moderationConcurrency()) {
    await new Promise<void>((resolve) => moderationWaiters.push(resolve));
  }
  activeModerationJobs += 1;
  try {
    return await work();
  } finally {
    activeModerationJobs -= 1;
    moderationWaiters.shift()?.();
  }
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function retryDelayMs(attempt: number): number {
  const delays = [5_000, 30_000, 120_000, 300_000];
  return delays[Math.min(Math.max(0, attempt - 1), delays.length - 1)];
}

function scheduleModeration(photoId: string, delayMs = 0): void {
  if (scheduled.has(photoId)) return;
  const timer = setTimeout(() => {
    scheduled.delete(photoId);
    void runModerationJob(photoId);
  }, Math.max(0, delayMs));
  timer.unref?.();
  scheduled.set(photoId, timer);
}

async function claimPhoto(
  photoId: string
): Promise<ClaimedModerationPhoto | null> {
  const staleBefore = new Date(Date.now() - config.moderationClaimStaleMs());
  const rows = await prisma.$queryRaw<ClaimedModerationPhoto[]>`
    UPDATE "Photo" AS p
       SET "moderationStatus" = 'processing',
           "moderationClaimedAt" = now(),
           "moderationNextRetryAt" = NULL,
           "moderationAttempts" = p."moderationAttempts" + 1
      FROM "Event" AS e
     WHERE p.id = ${photoId}
       AND p."eventId" = e.id
       AND p."uploadState" = 'ready'
       AND p."pendingBatchId" IS NULL
       AND (
         (p."moderationStatus" = 'queued'
           AND (p."moderationNextRetryAt" IS NULL OR p."moderationNextRetryAt" <= now()))
         OR
         (p."moderationStatus" = 'processing'
           AND p."moderationClaimedAt" < ${staleBefore})
       )
    RETURNING
      p.id,
      p."eventId",
      e."ownerId",
      p."moderationPolicyVersion",
      p."moderationThresholds",
      p."moderationAttempts",
      p."moderationClaimedAt"
  `;
  return rows[0] ?? null;
}

async function markFailed(
  photo: ClaimedModerationPhoto,
  error: unknown
): Promise<void> {
  // Never log the image, API payload, or provider response body.
  console.error(
    "Post-publish moderation attempt failed:",
    error instanceof Error ? error.message : "unknown error"
  );
  const terminal =
    photo.moderationAttempts >= config.moderationMaxAttempts();
  const delayMs = retryDelayMs(photo.moderationAttempts);
  const nextRetryAt = terminal ? null : new Date(Date.now() + delayMs);

  await prisma.photo.updateMany({
    where: { id: photo.id, moderationStatus: "processing" },
    data: {
      moderationStatus: terminal ? "error" : "queued",
      moderationClaimedAt: null,
      moderationNextRetryAt: nextRetryAt
    }
  });
  if (!terminal) scheduleModeration(photo.id, delayMs);
}

/**
 * Run one durable post-publish moderation job. The database claim prevents
 * duplicate provider calls across processes and makes crash recovery safe.
 */
export async function runModerationJob(photoId: string): Promise<void> {
  let photo: ClaimedModerationPhoto | null;
  try {
    photo = await claimPhoto(photoId);
  } catch (error) {
    console.error("Failed to claim moderation job:", error);
    return;
  }
  if (!photo) return;

  if (
    photo.moderationPolicyVersion == null ||
    !isModerationThresholds(photo.moderationThresholds)
  ) {
    await markFailed(photo, new Error("Invalid moderation policy snapshot"));
    return;
  }
  const thresholds = photo.moderationThresholds;

  try {
    await withModerationSlot(async () => {
      const imagePath = path.join(
        eventDir(photo!.ownerId, photo!.eventId),
        `${photo!.id}-med.webp`
      );
      const image = await fs.readFile(imagePath);
      const response = await moderateImage(image);
      const decision = evaluateModeration(response.result, thresholds);

      await prisma.$transaction(async (tx) => {
        const current = await tx.photo.findFirst({
          where: { id: photo!.id, moderationStatus: "processing" },
          select: { id: true, eventId: true }
        });
        if (!current) return;

        await tx.moderationScan.create({
          data: {
            photoId: photo!.id,
            requestId: response.id,
            requestedModel: MODERATION_MODEL,
            returnedModel: response.model,
            policyVersion: photo!.moderationPolicyVersion!,
            attempt: photo!.moderationAttempts,
            providerFlagged: response.result.flagged,
            categories: jsonValue(response.result.categories),
            categoryScores: jsonValue(response.result.categoryScores),
            appliedInputTypes: jsonValue(response.result.appliedInputTypes),
            thresholds: jsonValue(photo!.moderationThresholds),
            triggerReasons: jsonValue(decision.reasons),
            startedAt: photo!.moderationClaimedAt,
            completedAt: new Date()
          }
        });

        await tx.photo.update({
          where: { id: photo!.id },
          data: {
            moderationStatus: decision.flagged
              ? "review_required"
              : "approved",
            moderationClaimedAt: null,
            moderationNextRetryAt: null,
            homeHighlight: decision.flagged ? false : undefined
          }
        });

        if (decision.flagged) {
          await tx.event.updateMany({
            where: { id: current.eventId, coverPhotoId: photo!.id },
            data: { coverPhotoId: null }
          });
          await tx.moderationReview.upsert({
            where: { photoId: photo!.id },
            create: {
              photoId: photo!.id,
              status: "open",
              providerFlagged: response.result.flagged
            },
            update: {
              status: "open",
              providerFlagged: response.result.flagged
            }
          });
        } else {
          await tx.moderationReview.updateMany({
            where: { photoId: photo!.id },
            data: { status: "resolved_safe" }
          });
        }
      });
    });
  } catch (error) {
    await markFailed(photo, error);
  }
}

/** Enqueue after the publish transaction has committed. */
export function enqueueModeration(photoId: string): void {
  scheduleModeration(photoId);
}

/** Recover queued, delayed-retry, and stale processing jobs at process boot. */
export async function sweepPendingModeration(): Promise<void> {
  const staleBefore = new Date(Date.now() - config.moderationClaimStaleMs());
  let photos: { id: string; moderationNextRetryAt: Date | null }[];
  try {
    photos = await prisma.photo.findMany({
      where: {
        OR: [
          { moderationStatus: "queued" },
          {
            moderationStatus: "processing",
            moderationClaimedAt: { lt: staleBefore }
          }
        ]
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, moderationNextRetryAt: true }
    });
  } catch (error) {
    console.error("Failed to sweep moderation jobs:", error);
    return;
  }

  for (const photo of photos) {
    const delay = photo.moderationNextRetryAt
      ? Math.max(0, photo.moderationNextRetryAt.getTime() - Date.now())
      : 0;
    scheduleModeration(photo.id, delay);
  }
}
