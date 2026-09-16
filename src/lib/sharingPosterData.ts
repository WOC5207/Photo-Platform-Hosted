import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { formatDateRange } from "@/lib/datetime";
import { photoUrls } from "@/lib/images";
import { normalizeHomePhotoWeight } from "@/lib/homePhotoWeight";
import { pickText } from "@/lib/content";
import { publicPhotoWhere } from "@/lib/photoVisibility";
import type {
  SharingPosterComposition,
  SharingPosterPhotoValue,
  SharingPosterResolvedPhoto
} from "@/lib/sharingPoster";
import { sharingPosterMetadataFromPhotos } from "@/lib/sharingPoster";
import { photoNeedsSubject } from "@/lib/subjectDetection";
import { requestPhotoSubjects } from "@/lib/subjectDetectionWorker";

const photoSelect = {
  id: true,
  eventId: true,
  width: true,
  height: true,
  homeWeight: true,
  sortOrder: true,
  createdAt: true,
  exifCameraModel: true,
  exifLensModel: true,
  subjectX: true,
  subjectY: true,
  subjectBoxX: true,
  subjectBoxY: true,
  subjectBoxWidth: true,
  subjectBoxHeight: true,
  subjectVersion: true,
  event: {
    select: {
      ownerId: true,
      titleEn: true,
      titleZh: true,
      location: true,
      dateStart: true,
      dateEnd: true,
      createdAt: true
    }
  },
  credits: {
    orderBy: { sortOrder: "asc" as const },
    select: { creditName: true }
  }
} satisfies Prisma.PhotoSelect;

type PhotoRow = Prisma.PhotoGetPayload<{ select: typeof photoSelect }>;

function serializePhoto(row: PhotoRow, locale: string): SharingPosterPhotoValue {
  const urls = photoUrls(row.eventId, row.id);
  return {
    id: row.id,
    eventId: row.eventId,
    eventTitle: pickText(locale, row.event.titleEn, row.event.titleZh),
    eventDate: formatDateRange(row.event.dateStart, row.event.dateEnd),
    eventLocation: row.event.location,
    width: row.width,
    height: row.height,
    homeWeight: normalizeHomePhotoWeight(row.homeWeight),
    thumbUrl: urls.thumb,
    previewUrl: urls.med,
    fullUrl: urls.full,
    creditNames: row.credits.map(({ creditName }) => creditName.trim()).filter(Boolean),
    cameraModel: row.exifCameraModel?.trim() ?? "",
    lensModel: row.exifLensModel?.trim() ?? "",
    ...serializeSubject(row)
  };
}

function serializeSubject(
  row: Pick<PhotoRow, "subjectX" | "subjectY" | "subjectBoxX" | "subjectBoxY" | "subjectBoxWidth" | "subjectBoxHeight" | "subjectVersion">
): Pick<SharingPosterPhotoValue, "subjectState" | "subject"> {
  if (photoNeedsSubject(row)) return { subjectState: "pending", subject: null };
  if (row.subjectX === null || row.subjectY === null) return { subjectState: "none", subject: null };
  const hasBox =
    row.subjectBoxX !== null &&
    row.subjectBoxY !== null &&
    row.subjectBoxWidth !== null &&
    row.subjectBoxHeight !== null;
  return {
    subjectState: "detected",
    subject: {
      x: row.subjectX,
      y: row.subjectY,
      box: hasBox
        ? { x: row.subjectBoxX!, y: row.subjectBoxY!, width: row.subjectBoxWidth!, height: row.subjectBoxHeight! }
        : null
    }
  };
}

/** Ask the background worker for any rows still lacking a subject; never awaited. */
function nudgeSubjectDetection(rows: Pick<PhotoRow, "id" | "subjectVersion">[]): void {
  const missing = rows.filter((row) => photoNeedsSubject(row)).map((row) => row.id);
  if (missing.length > 0) requestPhotoSubjects(missing);
}

function eligiblePhotoWhere(ownerId: string): Prisma.PhotoWhereInput {
  return {
    ...publicPhotoWhere,
    event: { ownerId }
  };
}

export async function resolveSharingPosterPhotos(
  ownerId: string,
  locale: string,
  composition: SharingPosterComposition
): Promise<SharingPosterResolvedPhoto[]> {
  const ids = composition.photos.map(({ photoId }) => photoId);
  const rows = ids.length
    ? await prisma.photo.findMany({
        where: { id: { in: ids }, ...eligiblePhotoWhere(ownerId) },
        select: photoSelect
      })
    : [];
  nudgeSubjectDetection(rows);
  const byId = new Map(rows.map((row) => [row.id, serializePhoto(row, locale)]));
  return composition.photos.map((photo) => ({
    photoId: photo.photoId,
    composition: photo,
    source: byId.get(photo.photoId) ?? null
  }));
}

export async function getSharingPosterPhotosByIds(
  ownerId: string,
  locale: string,
  photoIds: string[]
): Promise<SharingPosterPhotoValue[]> {
  if (photoIds.length === 0) return [];
  const rows = await prisma.photo.findMany({
    where: { id: { in: photoIds }, ...eligiblePhotoWhere(ownerId) },
    select: photoSelect
  });
  nudgeSubjectDetection(rows);
  const byId = new Map(rows.map((row) => [row.id, serializePhoto(row, locale)]));
  return photoIds.flatMap((id) => {
    const photo = byId.get(id);
    return photo ? [photo] : [];
  });
}

export async function validateSharingPosterPhotoOwnership(
  ownerId: string,
  photoIds: string[],
  options: { allowMissing?: boolean } = {}
): Promise<boolean> {
  if (photoIds.length > 9 || new Set(photoIds).size !== photoIds.length) return false;
  if (photoIds.length === 0) return true;
  const rows = await prisma.photo.findMany({
    where: { id: { in: photoIds } },
    select: {
      id: true,
      pendingBatchId: true,
      uploadState: true,
      moderationStatus: true,
      event: { select: { ownerId: true } }
    }
  });
  if (!options.allowMissing && rows.length !== photoIds.length) return false;
  return rows.every(
    (row) =>
      row.event.ownerId === ownerId &&
      row.pendingBatchId === null &&
      row.uploadState === "ready" &&
      (row.moderationStatus === "not_required" || row.moderationStatus === "approved")
  );
}

export async function getSharingPosterPickerPage({
  ownerId,
  locale,
  cursor,
  eventId,
  credit,
  take = 48
}: {
  ownerId: string;
  locale: string;
  cursor?: string | null;
  eventId?: string | null;
  credit?: string | null;
  take?: number;
}): Promise<{ items: SharingPosterPhotoValue[]; nextCursor: string | null; total: number }> {
  const baseWhere: Prisma.PhotoWhereInput = {
    ...eligiblePhotoWhere(ownerId),
    ...(eventId ? { eventId } : {}),
    ...(credit?.trim()
      ? {
          credits: {
            some: { creditName: { contains: credit.trim(), mode: "insensitive" } }
          }
        }
      : {})
  };
  const decodedCursor = (() => {
    if (!cursor || cursor.length > 600) return null;
    try {
      const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Record<string, unknown>;
      if (
        typeof value.eventCreatedAt !== "string" ||
        typeof value.eventId !== "string" ||
        typeof value.sortOrder !== "number" ||
        typeof value.createdAt !== "string" ||
        typeof value.id !== "string"
      ) return null;
      const eventCreatedAt = new Date(value.eventCreatedAt);
      const createdAt = new Date(value.createdAt);
      if (!Number.isFinite(eventCreatedAt.getTime()) || !Number.isFinite(createdAt.getTime())) return null;
      return { eventCreatedAt, eventId: value.eventId, sortOrder: value.sortOrder, createdAt, id: value.id };
    } catch {
      return null;
    }
  })();
  const where: Prisma.PhotoWhereInput = decodedCursor
    ? {
        AND: [
          baseWhere,
          {
            OR: [
              { event: { createdAt: { lt: decodedCursor.eventCreatedAt } } },
              {
                event: { createdAt: decodedCursor.eventCreatedAt },
                eventId: { lt: decodedCursor.eventId }
              },
              {
                eventId: decodedCursor.eventId,
                sortOrder: { gt: decodedCursor.sortOrder }
              },
              {
                eventId: decodedCursor.eventId,
                sortOrder: decodedCursor.sortOrder,
                createdAt: { gt: decodedCursor.createdAt }
              },
              {
                eventId: decodedCursor.eventId,
                sortOrder: decodedCursor.sortOrder,
                createdAt: decodedCursor.createdAt,
                id: { gt: decodedCursor.id }
              }
            ]
          }
        ]
      }
    : baseWhere;
  const [rows, total] = await Promise.all([
    prisma.photo.findMany({
      where,
      orderBy: [
        { event: { createdAt: "desc" } },
        { eventId: "desc" },
        { sortOrder: "asc" },
        { createdAt: "asc" },
        { id: "asc" }
      ],
      take: take + 1,
      select: photoSelect
    }),
    prisma.photo.count({ where: baseWhere })
  ]);
  const pageRows = rows.slice(0, take);
  const last = pageRows.at(-1);
  nudgeSubjectDetection(pageRows);
  return {
    items: pageRows.map((row) => serializePhoto(row, locale)),
    nextCursor:
      rows.length > take && last
        ? Buffer.from(
            JSON.stringify({
              eventCreatedAt: last.event.createdAt.toISOString(),
              eventId: last.eventId,
              sortOrder: last.sortOrder,
              createdAt: last.createdAt.toISOString(),
              id: last.id
            })
          ).toString("base64url")
        : null,
    total
  };
}

export async function getSharingPosterMetadata(
  ownerId: string,
  locale: string,
  composition: SharingPosterComposition
) {
  const resolved = await resolveSharingPosterPhotos(ownerId, locale, composition);
  return sharingPosterMetadataFromPhotos(
    resolved.flatMap((photo) => (photo.source ? [photo.source] : []))
  );
}
