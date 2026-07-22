import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { findOwnedEvent } from "@/lib/ownership";
import { config } from "@/lib/config";
import {
  deletePhotoFiles,
  finalizePendingMaster,
  isStoragePreset,
  storePendingSource,
  resolveUploadExtension,
  withImageProcessingSlot,
  type CandidatePreset,
  type StoragePreset
} from "@/lib/images";
import { enqueueCompression } from "@/lib/compressionWorker";
import { parseCreditsJson, syncCreditProfiles } from "@/lib/photoCredits";
import {
  MultipartUploadError,
  parseSingleImageMultipart
} from "@/lib/multipartUpload";

const BATCH_ID_PATTERN = /^[a-zA-Z0-9_-]{16,100}$/;
const UPLOAD_ID_PATTERN = /^[a-f0-9]{32}$/;
const MAX_PENDING_PER_EVENT = 200;
const MAX_COMMENT_LENGTH = 2000;

/**
 * Parse the optional per-photo comment map the wizard sends alongside the
 * finalize credits. Unknown keys and non-string values are dropped; each
 * comment is trimmed and length-capped. Missing/invalid input → empty map.
 */
function parseCommentsMap(raw: unknown): Map<string, string> {
  const map = new Map<string, string>();
  if (typeof raw !== "string") return map;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return map;
  }
  if (!parsed || typeof parsed !== "object") return map;
  for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!UPLOAD_ID_PATTERN.test(id) || typeof value !== "string") continue;
    const comment = value.trim().slice(0, MAX_COMMENT_LENGTH);
    if (comment) map.set(id, comment);
  }
  return map;
}

class QuotaExceededError extends Error {}
class QueueFullError extends Error {}
class UploadConflictError extends Error {}
class PendingBatchChangedError extends Error {}

function statusForUploadState(state: string): number {
  return state === "processing" || state === "finalizing" || state === "deleting"
    ? 202
    : 200;
}

const uploadSelect = {
  id: true,
  eventId: true,
  filename: true,
  originalName: true,
  width: true,
  height: true,
  bytes: true,
  uploadState: true,
  pendingBatchId: true,
  storagePreset: true,
  candidatePreset: true,
  sourceFilename: true,
  sourceBytes: true,
  candidateBytes: true,
  renditionBytes: true,
  compressionFailed: true
} as const;

interface UploadRecord {
  id: string;
  eventId: string;
  filename: string;
  originalName: string;
  width: number;
  height: number;
  bytes: number;
  uploadState: string;
  pendingBatchId: string | null;
  storagePreset: string;
  candidatePreset: string | null;
  sourceFilename: string | null;
  sourceBytes: number | null;
  candidateBytes: number | null;
  renditionBytes: number | null;
  compressionFailed: boolean;
}

async function findOwnedUpload(
  uploadId: string,
  userId: string
): Promise<UploadRecord | null> {
  return prisma.photo.findFirst({
    where: { id: uploadId, event: { ownerId: userId } },
    select: uploadSelect
  });
}

function pendingPhotoJson(photo: UploadRecord) {
  const preset = isStoragePreset(photo.storagePreset)
    ? photo.storagePreset
    : "original";
  const selectedMasterBytes =
    preset === "original" ? photo.sourceBytes : photo.candidateBytes;
  const finalBytes =
    selectedMasterBytes != null && photo.renditionBytes != null
      ? selectedMasterBytes + photo.renditionBytes
      : null;
  return {
    id: photo.id,
    name: photo.originalName,
    previewUrl: `/api/images/${photo.eventId}/${photo.id}-thumb.webp`,
    state: photo.uploadState,
    width: photo.width,
    height: photo.height,
    batchId: photo.pendingBatchId,
    storagePreset: preset,
    candidatePreset:
      photo.candidatePreset === "archive" || photo.candidatePreset === "balanced"
        ? photo.candidatePreset
        : null,
    sourceBytes: photo.sourceBytes,
    candidateBytes: photo.candidateBytes,
    renditionBytes: photo.renditionBytes,
    pendingBytes: photo.bytes,
    finalBytes,
    compressionFailed: photo.compressionFailed
  };
}

function existingUploadResponse(photo: UploadRecord) {
  return NextResponse.json(
    pendingPhotoJson(photo),
    { status: statusForUploadState(photo.uploadState) }
  );
}

function creditSignature(
  credits: {
    creditName: string;
    subject: string;
    socialLinks: { platform: string; url: string }[];
  }[]
): string {
  return JSON.stringify(credits);
}

/**
 * Finish a claimed deletion while preserving the database row if filesystem
 * cleanup fails. A later DELETE can then retry with the original filename and
 * reservation still available.
 */
async function cleanupDeletingPhoto(
  userId: string,
  eventId: string,
  photoId: string,
  filename: string
): Promise<boolean> {
  try {
    await deletePhotoFiles(userId, eventId, photoId, filename);
  } catch (err) {
    console.error("Failed to remove pending photo files:", err);
    return false;
  }

  try {
    await prisma.$transaction(async (tx) => {
      // The user row is locked before touching Photo so reconcileQuota sees
      // either both reservation records or neither, never a half-transition.
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
      const photo = await tx.photo.findFirst({
        where: {
          id: photoId,
          eventId,
          uploadState: "deleting",
          event: { ownerId: userId }
        },
        select: { id: true, bytes: true }
      });
      if (!photo) return;

      // Pending photos are accounted in pendingBytes, not usedBytes, so a
      // discard releases the pending reservation.
      await tx.$executeRaw`
        UPDATE "User"
           SET "pendingBytes" = GREATEST(0, "pendingBytes" - ${BigInt(photo.bytes)})
         WHERE id = ${userId}
      `;
      await tx.photo.delete({ where: { id: photo.id } });
    });
    return true;
  } catch (err) {
    console.error("Failed to release pending photo reservation:", err);
    return false;
  }
}

/** Move an unfinished upload into the durable, retryable cleanup state. */
async function markAwaitingForDeletion(
  userId: string,
  eventId: string,
  photoId: string
): Promise<boolean> {
  const changed = await prisma.photo.updateMany({
    where: {
      id: photoId,
      eventId,
      // The source-storing half leaves the row "awaiting" (a size has not been
      // chosen yet), so a mid-store failure is cleaned up from that state.
      uploadState: "awaiting",
      event: { ownerId: userId }
    },
    data: { uploadState: "deleting" }
  });
  return changed.count === 1;
}

/** List the durable queue so retries, reloads and other tabs can reconcile. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const eventId = req.nextUrl.searchParams.get("eventId") ?? "";
  const uploadId = req.nextUrl.searchParams.get("uploadId") ?? "";
  if (!eventId || (uploadId && !UPLOAD_ID_PATTERN.test(uploadId))) {
    return NextResponse.json({ error: "badRequest" }, { status: 400 });
  }
  if (!(await findOwnedEvent(eventId, user))) {
    return NextResponse.json({ error: "eventNotFound" }, { status: 404 });
  }

  const photos = await prisma.photo.findMany({
    where: {
      eventId,
      ...(uploadId
        ? { id: uploadId }
        : { pendingBatchId: { not: null } })
    },
    orderBy: { createdAt: "asc" },
    select: {
      ...uploadSelect
    }
  });

  return NextResponse.json({
    photos: photos.map((photo) => pendingPhotoJson(photo))
  });
}

/**
 * Upload and process one selected file immediately.
 *
 * Photo.id is supplied by the client and doubles as an idempotency key. The
 * processing placeholder and its quota reservation are created atomically,
 * so a lost response can be retried without creating or charging a duplicate.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let upload;
  try {
    upload = await parseSingleImageMultipart(req);
  } catch (error) {
    const tooLarge = error instanceof MultipartUploadError && error.code === "tooLarge";
    return NextResponse.json(
      { error: tooLarge ? "tooLarge" : "badRequest" },
      { status: tooLarge ? 413 : 400 }
    );
  }
  const form = upload.fields;
  const eventId = form.get("eventId");
  const batchId = form.get("batchId");
  const uploadId = form.get("uploadId");
  const requestedPreset = form.get("storagePreset");
  const file = upload.file;

  try {

  if (
    typeof eventId !== "string" ||
    typeof batchId !== "string" ||
    !BATCH_ID_PATTERN.test(batchId) ||
    typeof uploadId !== "string" ||
    !UPLOAD_ID_PATTERN.test(uploadId) ||
    !isStoragePreset(requestedPreset) ||
    (config.stripOriginalExif() && requestedPreset === "original") ||
    !file
  ) {
    return NextResponse.json({ error: "badRequest" }, { status: 400 });
  }

  if (!(await findOwnedEvent(eventId, user))) {
    return NextResponse.json({ error: "eventNotFound" }, { status: 404 });
  }

  const ext = resolveUploadExtension(file);
  if (!ext) {
    return NextResponse.json({ error: "unsupportedType" }, { status: 415 });
  }
  if (file.size > config.uploadMaxBytes()) {
    return NextResponse.json({ error: "tooLarge" }, { status: 413 });
  }

  const existing = await findOwnedUpload(uploadId, user.id);
  if (existing) {
    if (existing.eventId !== eventId) {
      return NextResponse.json({ error: "uploadConflict" }, { status: 409 });
    }
    return existingUploadResponse(existing);
  }

  const storagePreset: StoragePreset = requestedPreset;
  const candidatePreset: CandidatePreset =
    storagePreset === "original" ? "balanced" : storagePreset;
  const expectedSourceFilename = `${uploadId}-source.${ext}`;
  const reserved = file.size;

  try {
    await prisma.$transaction(async (tx) => {
      // Serializes the cap with other uploads and finalization for this event.
      const lockedEvent = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Event" WHERE id = ${eventId} FOR UPDATE
      `;
      if (lockedEvent.length !== 1) throw new UploadConflictError();

      const pendingCount = await tx.photo.count({
        where: { eventId, pendingBatchId: { not: null } }
      });
      if (pendingCount >= MAX_PENDING_PER_EVENT) throw new QueueFullError();

      // Pending photos no longer count toward the storage quota — they are
      // charged at publish. This conditional update reserves the source against
      // the pending-disk cap (so a runaway cannot fill the NAS) and locks the
      // counter until the placeholder is present in the same commit.
      const updated = await tx.$executeRaw`
        UPDATE "User" AS u
           SET "pendingBytes" = u."pendingBytes" + ${BigInt(reserved)}
         WHERE u.id = ${user.id}
           AND u."pendingBytes" + ${BigInt(reserved)} <= ${BigInt(config.pendingMaxBytes())}
      `;
      if (updated !== 1) throw new QuotaExceededError();

      await tx.photo.create({
        data: {
          id: uploadId,
          eventId,
          filename: expectedSourceFilename,
          originalName: file.name.slice(0, 300),
          width: 1,
          height: 1,
          bytes: reserved,
          sortOrder: 0,
          pendingBatchId: batchId,
          // The source and thumbnail are stored below, but compression is
          // deferred: the row stays "awaiting" until the user chooses a size in
          // the wizard's compression step, which is what starts the encode.
          uploadState: "awaiting",
          storagePreset,
          candidatePreset,
          sourceFilename: expectedSourceFilename,
          sourceBytes: reserved
        }
      });
    });
  } catch (err) {
    if (err instanceof QuotaExceededError) {
      return NextResponse.json({ error: "quotaExceeded" }, { status: 413 });
    }
    if (err instanceof QueueFullError) {
      return NextResponse.json({ error: "queueFull" }, { status: 409 });
    }

    // A concurrent retry may have won the idempotency key. Return that owned
    // row rather than surfacing the primary-key race as an error.
    const raced = await findOwnedUpload(uploadId, user.id);
    if (raced && raced.eventId === eventId) return existingUploadResponse(raced);

    console.error("Failed to reserve pending photo:", err);
    return NextResponse.json({ error: "uploadConflict" }, { status: 409 });
  }

  // Fast path: store the exact source and a thumbnail only, so the wizard has an
  // instant preview. The remaining renditions and the compressed master are
  // produced later by the background worker — but only once the user picks a
  // size in the compression step (see PUT), never automatically here.
  let stored;
  try {
    stored = await withImageProcessingSlot(() =>
      storePendingSource(user.id, eventId, uploadId, file.path, ext)
    );
  } catch {
    const claimed = await markAwaitingForDeletion(user.id, eventId, uploadId);
    const current = claimed ? null : await findOwnedUpload(uploadId, user.id);
    if (claimed || current?.uploadState === "deleting" || !current) {
      await cleanupDeletingPhoto(
        user.id,
        eventId,
        uploadId,
        expectedSourceFilename
      );
    }
    return NextResponse.json({ error: "invalidImage" }, { status: 400 });
  }

  try {
    const storedBytes = stored.sourceBytes + stored.thumbBytes;
    const delta = storedBytes - reserved;
    await prisma.$transaction(async (tx) => {
      // The thumbnail is real disk usage on top of the reserved source; true up
      // the pending counter. Not re-checked against the cap: the bytes are
      // already written, and reconcile corrects any small overshoot.
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
      if (delta !== 0) {
        await tx.$executeRaw`
          UPDATE "User"
             SET "pendingBytes" = GREATEST(0, "pendingBytes" + ${BigInt(delta)})
           WHERE id = ${user.id}
        `;
      }

      const updated = await tx.photo.updateMany({
        where: {
          id: uploadId,
          eventId,
          pendingBatchId: batchId,
          uploadState: "awaiting"
        },
        data: {
          width: stored.width,
          height: stored.height,
          bytes: storedBytes,
          sourceFilename: stored.sourceFilename,
          sourceBytes: stored.sourceBytes,
          // Only the thumbnail exists yet; the worker overwrites this with the
          // full rendition total when it finishes.
          renditionBytes: stored.thumbBytes,
          exifFocalLengthMm: stored.exif.focalLengthMm,
          exifAperture: stored.exif.aperture,
          exifExposureTime: stored.exif.exposureTime,
          exifIso: stored.exif.iso,
          exifTakenAt: stored.exif.takenAt,
          exifCameraModel: stored.exif.cameraModel,
          exifLensModel: stored.exif.lensModel
        }
      });
      if (updated.count !== 1) throw new UploadConflictError();
    });
  } catch (err) {
    // If the row was discarded during the brief thumbnail write, cleanup
    // already handled it; otherwise surface the failure.
    const current = await findOwnedUpload(uploadId, user.id);
    if (!current) {
      return NextResponse.json({ error: "unknown" }, { status: 500 });
    }
    if (current.uploadState === "deleting") {
      return NextResponse.json({ error: "invalidImage" }, { status: 400 });
    }
    console.error("Failed to record pending photo source:", err);
    return NextResponse.json({ error: "unknown" }, { status: 500 });
  }

  // Compression is intentionally NOT started here. The row stays "awaiting"
  // until the user selects a compression size in the wizard's second step,
  // which triggers the background worker via PUT. This lets the upload settle
  // (advancing to the next step) without committing to a size or paying for an
  // encode the user may want to change.
  const completed = await findOwnedUpload(uploadId, user.id);
  if (!completed) {
    return NextResponse.json({ error: "unknown" }, { status: 500 });
  }
  return NextResponse.json(pendingPhotoJson(completed), { status: 201 });
  } finally {
    await upload.cleanup();
  }
}

/** Change one pending photo's selected master or regenerate its comparison. */
export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const photoId = typeof body?.photoId === "string" ? body.photoId : "";
  const requestedPreset = body?.storagePreset;
  if (
    !UPLOAD_ID_PATTERN.test(photoId) ||
    !isStoragePreset(requestedPreset) ||
    (config.stripOriginalExif() && requestedPreset === "original")
  ) {
    return NextResponse.json({ error: "badRequest" }, { status: 400 });
  }
  const storagePreset: StoragePreset = requestedPreset;

  const current = await findOwnedUpload(photoId, user.id);
  if (!current || current.pendingBatchId === null) {
    return NextResponse.json({ error: "photoNotFound" }, { status: 404 });
  }
  // A size choice is accepted while the upload is awaiting a choice, already
  // compressed (pending), or still compressing (processing) — this endpoint is
  // both the first compression trigger and the way to change it. Only
  // finalizing/deleting are terminal here.
  if (
    current.uploadState !== "awaiting" &&
    current.uploadState !== "pending" &&
    current.uploadState !== "processing"
  ) {
    return NextResponse.json(
      pendingPhotoJson(current),
      { status: statusForUploadState(current.uploadState) }
    );
  }

  // Pre-migration pending uploads stay usable as Original without a filesystem
  // migration. They can still be finalized or removed normally.
  if (!current.sourceFilename) {
    if (storagePreset !== "original") {
      return NextResponse.json({ error: "legacyPending" }, { status: 409 });
    }
    const updated = await prisma.photo.update({
      where: { id: current.id },
      data: { storagePreset: "original" },
      select: uploadSelect
    });
    return NextResponse.json(pendingPhotoJson(updated));
  }

  const candidatePreset: CandidatePreset =
    storagePreset === "original"
      ? current.candidatePreset === "archive"
        ? "archive"
        : "balanced"
      : storagePreset;

  // Fast path: a fully-compressed pending row whose stored candidate already
  // matches the requested master needs only a flag flip, no re-encode.
  if (
    current.uploadState === "pending" &&
    !current.compressionFailed &&
    current.renditionBytes != null &&
    current.candidateBytes != null &&
    (storagePreset === "original" || current.candidatePreset === candidatePreset)
  ) {
    const updated = await prisma.photo.updateMany({
      where: { id: current.id, uploadState: "pending" },
      data: { storagePreset }
    });
    const latest = await findOwnedUpload(current.id, user.id);
    if (updated.count !== 1 || !latest) {
      return NextResponse.json({ error: "uploadConflict" }, { status: 409 });
    }
    return NextResponse.json(pendingPhotoJson(latest));
  }

  // Otherwise (re)compress in the background: record the desired preset, mark
  // the row processing and hand it to the worker, which trues up pendingBytes
  // when it commits. compressionClaimedAt is deliberately left untouched so a
  // worker already encoding this row detects the change and re-runs itself.
  const claimed = await prisma.photo.updateMany({
    where: {
      id: current.id,
      pendingBatchId: { not: null },
      uploadState: { in: ["awaiting", "pending", "processing"] }
    },
    data: {
      storagePreset,
      candidatePreset,
      uploadState: "processing",
      compressionFailed: false
    }
  });
  if (claimed.count !== 1) {
    return NextResponse.json({ error: "uploadConflict" }, { status: 409 });
  }
  enqueueCompression(current.id);

  const updated = await findOwnedUpload(current.id, user.id);
  if (!updated) return NextResponse.json({ error: "unknown" }, { status: 500 });
  return NextResponse.json(pendingPhotoJson(updated));
}

/**
 * Finalize exactly the named pending photos. The all-ready branch makes a
 * response-loss retry idempotent without changing already-applied credits.
 */
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const eventId = typeof body?.eventId === "string" ? body.eventId : "";
  const rawPhotoIds = Array.isArray(body?.photoIds) ? body.photoIds : [];
  const rawIds = rawPhotoIds.filter(
    (id): id is string => typeof id === "string" && UPLOAD_ID_PATTERN.test(id)
  );
  const photoIds = Array.from(new Set(rawIds));
  const credits = parseCreditsJson(
    typeof body?.credits === "string" ? body.credits : null
  );
  const comments = parseCommentsMap(body?.comments);
  const commentFor = (id: string) => comments.get(id) ?? "";

  // credits may be empty: the wizard's confirm step lets photos publish
  // uncredited after an explicit acknowledgement.
  if (
    !eventId ||
    photoIds.length === 0 ||
    rawIds.length !== rawPhotoIds.length ||
    photoIds.length !== rawIds.length ||
    photoIds.length > MAX_PENDING_PER_EVENT
  ) {
    return NextResponse.json({ error: "badRequest" }, { status: 400 });
  }
  if (!(await findOwnedEvent(eventId, user))) {
    return NextResponse.json({ error: "eventNotFound" }, { status: 404 });
  }

  let alreadyFinalized = false;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR UPDATE`;
      const photos = await tx.photo.findMany({
        where: { id: { in: photoIds }, eventId },
        select: {
          id: true,
          pendingBatchId: true,
          uploadState: true,
          comment: true,
          credits: {
            orderBy: { sortOrder: "asc" },
            select: {
              creditName: true,
              subject: true,
              socialLinks: {
                orderBy: { sortOrder: "asc" },
                select: { platform: true, url: true }
              }
            }
          }
        }
      });
      if (photos.length !== photoIds.length) throw new PendingBatchChangedError();

      alreadyFinalized = photos.every(
        (photo) => photo.uploadState === "ready" && photo.pendingBatchId === null
      );
      if (alreadyFinalized) {
        const expectedCredits = creditSignature(credits);
        // A response-loss retry is idempotent only for the exact same credits
        // AND comments; anything else means the batch changed underneath us.
        if (
          !photos.every(
            (photo) =>
              creditSignature(photo.credits) === expectedCredits &&
              photo.comment === commentFor(photo.id)
          )
        ) {
          throw new PendingBatchChangedError();
        }
        return;
      }

      const resumable = photos.every(
        (photo) =>
          photo.pendingBatchId !== null &&
          (photo.uploadState === "pending" || photo.uploadState === "finalizing")
      );
      if (!resumable) throw new PendingBatchChangedError();

      await tx.photo.updateMany({
        where: { id: { in: photoIds }, eventId, uploadState: "pending" },
        data: { uploadState: "finalizing" }
      });
    });
  } catch (err) {
    if (err instanceof PendingBatchChangedError) {
      return NextResponse.json(
        { error: "pendingBatchChanged" },
        { status: 409 }
      );
    }
    console.error("Failed to finalize pending photos:", err);
    return NextResponse.json({ error: "unknown" }, { status: 500 });
  }

  if (!alreadyFinalized) {
    const claimed = await prisma.photo.findMany({
      where: { id: { in: photoIds }, eventId },
      select: uploadSelect
    });
    if (claimed.length !== photoIds.length) {
      return NextResponse.json({ error: "pendingBatchChanged" }, { status: 409 });
    }

    const finalized = new Map<string, { filename: string; bytes: number }>();
    try {
      // Sequential filesystem work keeps Sharp/disk pressure predictable and
      // leaves each photo independently resumable through its stable -orig file.
      for (const photoId of photoIds) {
        const photo = claimed.find((candidate) => candidate.id === photoId)!;
        if (!isStoragePreset(photo.storagePreset)) {
          throw new Error("Invalid persisted storage preset");
        }
        finalized.set(
          photo.id,
          await finalizePendingMaster(user.id, eventId, photo.id, {
            filename: photo.filename,
            bytes: photo.bytes,
            storagePreset: photo.storagePreset,
            sourceFilename: photo.sourceFilename,
            sourceBytes: photo.sourceBytes,
            candidateBytes: photo.candidateBytes,
            renditionBytes: photo.renditionBytes
          })
        );
      }
    } catch (err) {
      console.error("Failed to finalize pending photo files:", err);
      return NextResponse.json({ error: "unknown" }, { status: 500 });
    }

    try {
      await prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR UPDATE`;
          await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
          const photos = await tx.photo.findMany({
            where: { id: { in: photoIds }, eventId },
            select: {
              id: true,
              bytes: true,
              uploadState: true,
              pendingBatchId: true,
              comment: true,
              credits: {
                orderBy: { sortOrder: "asc" },
                select: {
                  creditName: true,
                  subject: true,
                  socialLinks: {
                    orderBy: { sortOrder: "asc" },
                    select: { platform: true, url: true }
                  }
                }
              }
            }
          });
          if (photos.length !== photoIds.length) throw new PendingBatchChangedError();

          const nowReady = photos.every(
            (photo) => photo.uploadState === "ready" && photo.pendingBatchId === null
          );
          if (nowReady) {
            const expectedCredits = creditSignature(credits);
            if (
              !photos.every(
                (photo) =>
                  creditSignature(photo.credits) === expectedCredits &&
                  photo.comment === commentFor(photo.id)
              )
            ) {
              throw new PendingBatchChangedError();
            }
            return;
          }
          if (
            !photos.every(
              (photo) =>
                photo.uploadState === "finalizing" && photo.pendingBatchId !== null
            )
          ) {
            throw new PendingBatchChangedError();
          }

          // Publish is where storage is finally charged: the finalized bytes
          // move from the pending counter into usedBytes (the quota-bearing
          // total), and the pending reservation for these photos is released.
          const previousBytes = photos.reduce((sum, photo) => sum + photo.bytes, 0);
          const finalBytes = photoIds.reduce(
            (sum, id) => sum + (finalized.get(id)?.bytes ?? 0),
            0
          );
          if (finalBytes > 0) {
            await tx.$executeRaw`
              UPDATE "User"
                 SET "usedBytes" = GREATEST(0, "usedBytes" + ${BigInt(finalBytes)})
               WHERE id = ${user.id}
            `;
          }
          if (previousBytes > 0) {
            await tx.$executeRaw`
              UPDATE "User"
                 SET "pendingBytes" = GREATEST(0, "pendingBytes" - ${BigInt(previousBytes)})
               WHERE id = ${user.id}
            `;
          }

          const maxOrder = await tx.photo.aggregate({
            where: { eventId, pendingBatchId: null },
            _max: { sortOrder: true }
          });
          const firstOrder = (maxOrder._max.sortOrder ?? 0) + 1;
          for (let photoIndex = 0; photoIndex < photoIds.length; photoIndex++) {
            const id = photoIds[photoIndex];
            const file = finalized.get(id)!;
            await tx.photo.update({
              where: { id },
              data: {
                filename: file.filename,
                bytes: file.bytes,
                sourceFilename: null,
                pendingBatchId: null,
                uploadState: "ready",
                sortOrder: firstOrder + photoIndex,
                comment: commentFor(id),
                credits: {
                  create: credits.map((credit, creditIndex) => ({
                    creditName: credit.creditName,
                    subject: credit.subject,
                    sortOrder: creditIndex,
                    socialLinks: {
                      create: credit.socialLinks.map((link, linkIndex) => ({
                        platform: link.platform,
                        url: link.url,
                        sortOrder: linkIndex
                      }))
                    }
                  }))
                }
              }
            });
          }
        },
        { timeout: 60_000 }
      );
    } catch (err) {
      if (err instanceof PendingBatchChangedError) {
        return NextResponse.json({ error: "pendingBatchChanged" }, { status: 409 });
      }
      console.error("Failed to commit finalized pending photos:", err);
      return NextResponse.json({ error: "unknown" }, { status: 500 });
    }
  }

  await syncCreditProfiles(user.id, credits).catch((err) =>
    console.error("Failed to sync credit profiles:", err)
  );

  revalidatePath("/", "layout");
  return NextResponse.json({ ids: photoIds });
}

/**
 * Idempotently discard one pending photo. A durable deleting state keeps the
 * cleanup metadata available if filesystem or counter cleanup must be retried.
 */
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const photoId = typeof body?.photoId === "string" ? body.photoId : "";
  if (!UPLOAD_ID_PATTERN.test(photoId)) {
    return NextResponse.json({ error: "badRequest" }, { status: 400 });
  }

  const claimed = await prisma.$transaction(async (tx) => {
    const photo = await tx.photo.findFirst({
      where: {
        id: photoId,
        pendingBatchId: { not: null },
        uploadState: {
          in: ["awaiting", "processing", "pending", "finalizing", "deleting"]
        },
        event: { ownerId: user.id }
      }
    });
    if (!photo) return null;

    await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${photo.eventId} FOR UPDATE`;
    if (photo.uploadState !== "deleting") {
      const changed = await tx.photo.updateMany({
        where: { id: photo.id, uploadState: photo.uploadState },
        data: { uploadState: "deleting" }
      });
      if (changed.count !== 1) return null;
    }
    return photo;
  });

  // Missing, foreign, already finalized and already-deleted all intentionally
  // look the same. That is both idempotent and avoids confirming foreign ids.
  if (!claimed) return NextResponse.json({ ok: true, alreadyRemoved: true });

  if (
    !(await cleanupDeletingPhoto(
      user.id,
      claimed.eventId,
      claimed.id,
      claimed.filename
    ))
  ) {
    return NextResponse.json({ error: "unknown" }, { status: 500 });
  }

  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true });
}
