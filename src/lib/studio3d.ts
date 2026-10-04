import "server-only";
import { redirect } from "next/navigation";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { pickText } from "@/lib/content";
import { formatDateRange } from "@/lib/datetime";
import { photoUrls } from "@/lib/images";
import { ownerName } from "@/lib/owner";
import { getActiveNotificationsForUser } from "@/lib/platformNotifications";
import { moderationAllowsPublicPhoto, publicPhotoWhere } from "@/lib/photoVisibility";
import { getQuotaUsage } from "@/lib/quota";
import { getSiteSettings, resolveCreditTerm } from "@/lib/settings";
import type {
  StudioAccount,
  StudioEventDetail,
  StudioEventSummary,
  StudioHome,
  StudioPhoto
} from "@/components/album3d/studio/types";

/**
 * The 3D Dashboard's reads: a photographer's own events, drafts included,
 * and their photos. Writes go through the classic dashboard's server
 * actions, which already scope every change to the signed-in account.
 */

/** Photos the light table lays out at once; it keeps textures only near the focus. */
const MAX_PHOTOS = 1200;

/**
 * The signed-in photographer, when the address is theirs. Signed out goes to
 * the 3D login; someone else's Dashboard goes to their own. Invited
 * photographers finish the classic first-run setup before anything else, as
 * the classic dashboard requires.
 */
export async function requireStudioUser(username: string, locale: string): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect(`/${locale}/3d/login`);
  if (user.username !== username) redirect(`/${locale}/3d/u/${encodeURIComponent(user.username)}/studio`);
  if (user.role !== "admin" && !(await getSiteSettings(user.id)).setupCompleted) {
    redirect(`/${locale}/dashboard/setup`);
  }
  return user;
}

export function studioAccount(user: User): StudioAccount {
  return { username: user.username, name: ownerName(user), admin: user.role === "admin" };
}

export async function loadStudioHome(user: User, locale: string, creditFallback: string): Promise<StudioHome> {
  const [events, drafts, photos, listed, usage, settings, notices] = await Promise.all([
    prisma.event.count({ where: { ownerId: user.id } }),
    prisma.event.count({ where: { ownerId: user.id, published: false } }),
    prisma.photo.count({ where: { event: { ownerId: user.id }, pendingBatchId: null } }),
    prisma.event.count({ where: { ownerId: user.id, published: true, photos: { some: publicPhotoWhere } } }),
    getQuotaUsage(user.id),
    getSiteSettings(user.id),
    getActiveNotificationsForUser(user.id)
  ]);
  return {
    account: studioAccount(user),
    listed: listed > 0,
    events,
    drafts,
    photos,
    usedBytes: usage.usedBytes,
    quotaBytes: usage.quotaBytes,
    creditTerm: resolveCreditTerm(settings, locale, creditFallback),
    notices: notices.map((n) => ({
      id: n.id,
      title: pickText(locale, n.titleEn, n.titleZh),
      body: pickText(locale, n.bodyEn, n.bodyZh)
    }))
  };
}

const summarySelect = {
  id: true,
  titleEn: true,
  titleZh: true,
  dateStart: true,
  dateEnd: true,
  location: true,
  published: true,
  _count: { select: { photos: { where: { pendingBatchId: null } } } }
} as const;

function summary(
  locale: string,
  event: {
    id: string;
    titleEn: string;
    titleZh: string;
    dateStart: Date | null;
    dateEnd: Date | null;
    location: string;
    published: boolean;
    _count: { photos: number };
  }
): StudioEventSummary {
  return {
    id: event.id,
    title: pickText(locale, event.titleEn, event.titleZh),
    dateLabel: formatDateRange(event.dateStart, event.dateEnd),
    location: event.location,
    published: event.published,
    photoCount: event._count.photos
  };
}

/** Every event of the photographer's, newest first, as the classic list orders them. */
export async function loadStudioEvents(user: User, locale: string): Promise<StudioEventSummary[]> {
  const events = await prisma.event.findMany({
    where: { ownerId: user.id },
    orderBy: [{ dateStart: "desc" }, { createdAt: "desc" }],
    select: summarySelect
  });
  return events.map((event) => summary(locale, event));
}

const day = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : "");

export async function loadStudioEvent(user: User, id: string, locale: string): Promise<StudioEventDetail | null> {
  const event = await prisma.event.findFirst({
    where: { id, ownerId: user.id },
    select: {
      ...summarySelect,
      slug: true,
      descriptionEn: true,
      descriptionZh: true
    }
  });
  if (!event) return null;
  const [pendingCount, publicCount] = await Promise.all([
    prisma.photo.count({ where: { eventId: event.id, pendingBatchId: { not: null } } }),
    event.published ? prisma.photo.count({ where: { eventId: event.id, ...publicPhotoWhere } }) : 0
  ]);
  return {
    ...summary(locale, event),
    titleEn: event.titleEn,
    titleZh: event.titleZh,
    slug: event.slug,
    dateStart: day(event.dateStart),
    dateEnd: day(event.dateEnd),
    descriptionEn: event.descriptionEn,
    descriptionZh: event.descriptionZh,
    pendingCount,
    publicPath:
      publicCount > 0 ? `/3d/u/${encodeURIComponent(user.username)}/albums/${encodeURIComponent(event.slug)}` : null
  };
}

const SCREENING: Record<string, string> = {
  queued: "pending",
  processing: "pending",
  review_required: "review",
  rejected: "rejected",
  error: "error"
};

/** The event's photos in album order, with what the light table marks on them. */
export async function loadStudioPhotos(user: User, eventId: string): Promise<StudioPhoto[]> {
  const event = await prisma.event.findFirst({
    where: { id: eventId, ownerId: user.id },
    select: { coverPhotoId: true }
  });
  if (!event) return [];
  const photos = await prisma.photo.findMany({
    where: { eventId, pendingBatchId: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    take: MAX_PHOTOS,
    select: {
      id: true,
      width: true,
      height: true,
      originalName: true,
      homeHighlight: true,
      moderationStatus: true,
      credits: { orderBy: { sortOrder: "asc" }, take: 1, select: { creditName: true, subject: true } }
    }
  });
  return photos.map((photo) => {
    const urls = photoUrls(eventId, photo.id);
    const visible = moderationAllowsPublicPhoto(photo.moderationStatus);
    return {
      id: photo.id,
      thumb: urls.thumb,
      med: urls.med,
      width: photo.width,
      height: photo.height,
      name: photo.originalName,
      cover: photo.id === event.coverPhotoId,
      highlight: photo.homeHighlight,
      visible,
      screening: visible ? "" : (SCREENING[photo.moderationStatus] ?? "pending"),
      credit: photo.credits[0]?.creditName ?? "",
      subject: photo.credits[0]?.subject ?? ""
    };
  });
}
