import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { photoUrls } from "@/lib/images";
import { formatShutterSpeedInput } from "@/lib/exif";
import {
  warningCategoriesFromReasons,
  type PhotoModerationStatus
} from "@/lib/moderationPolicy";

export interface AdminPhotoValue {
  id: string;
  thumbUrl: string;
  credits: { creditName: string; subject: string; socialLinks: { platform: string; url: string }[] }[];
  comment: string;
  isCover: boolean;
  homeHighlight: boolean;
  homeWeight: number;
  moderationStatus: PhotoModerationStatus;
  moderationCategories: ReturnType<typeof warningCategoriesFromReasons>;
  exif: {
    focalLengthMm: string;
    aperture: string;
    exposureTime: string;
    iso: string;
    takenAt: string;
    cameraModel: string;
    lensModel: string;
  };
}

export interface AdminPhotoPage {
  items: AdminPhotoValue[];
  nextCursor: string | null;
  total: number;
}

const include = {
  credits: {
    orderBy: { sortOrder: "asc" },
    include: { socialLinks: { orderBy: { sortOrder: "asc" } } }
  },
  moderationScans: {
    orderBy: { createdAt: "desc" },
    take: 1,
    select: { triggerReasons: true }
  }
} satisfies Prisma.PhotoInclude;

type PhotoRow = Prisma.PhotoGetPayload<{ include: typeof include }>;

function serialize(eventId: string, coverPhotoId: string | null, photo: PhotoRow): AdminPhotoValue {
  return {
    id: photo.id,
    thumbUrl: photoUrls(eventId, photo.id).thumb,
    credits: photo.credits.map((credit) => ({
      creditName: credit.creditName,
      subject: credit.subject,
      socialLinks: credit.socialLinks.map((link) => ({ platform: link.platform, url: link.url }))
    })),
    comment: photo.comment,
    isCover: coverPhotoId === photo.id,
    homeHighlight: photo.homeHighlight,
    homeWeight: photo.homeWeight,
    moderationStatus: photo.moderationStatus as PhotoModerationStatus,
    moderationCategories: warningCategoriesFromReasons(photo.moderationScans[0]?.triggerReasons),
    exif: {
      focalLengthMm: photo.exifFocalLengthMm?.toString() ?? "",
      aperture: photo.exifAperture?.toString() ?? "",
      exposureTime: formatShutterSpeedInput(photo.exifExposureTime),
      iso: photo.exifIso?.toString() ?? "",
      takenAt: photo.exifTakenAt ? photo.exifTakenAt.toISOString().slice(0, 10) : "",
      cameraModel: photo.exifCameraModel ?? "",
      lensModel: photo.exifLensModel ?? ""
    }
  };
}

export async function getAdminPhotoPage({
  eventId,
  ownerId,
  cursor,
  take = 48
}: {
  eventId: string;
  ownerId: string;
  cursor?: string | null;
  take?: number;
}): Promise<AdminPhotoPage | null> {
  const event = await prisma.event.findFirst({
    where: { id: eventId, ownerId },
    select: { coverPhotoId: true }
  });
  if (!event) return null;

  const cursorPhoto = cursor
    ? await prisma.photo.findFirst({
        where: { id: cursor, eventId, pendingBatchId: null },
        select: { sortOrder: true, createdAt: true, id: true }
      })
    : null;
  if (cursor && !cursorPhoto) return null;

  const after = cursorPhoto
    ? {
        OR: [
          { sortOrder: { gt: cursorPhoto.sortOrder } },
          { sortOrder: cursorPhoto.sortOrder, createdAt: { gt: cursorPhoto.createdAt } },
          {
            sortOrder: cursorPhoto.sortOrder,
            createdAt: cursorPhoto.createdAt,
            id: { gt: cursorPhoto.id }
          }
        ]
      }
    : {};
  const [rows, total] = await Promise.all([
    prisma.photo.findMany({
      where: { eventId, pendingBatchId: null, ...after },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      take: take + 1,
      include
    }),
    prisma.photo.count({ where: { eventId, pendingBatchId: null } })
  ]);
  const pageRows = rows.slice(0, take);
  return {
    items: pageRows.map((photo) => serialize(eventId, event.coverPhotoId, photo)),
    nextCursor: rows.length > take ? pageRows.at(-1)?.id ?? null : null,
    total
  };
}
