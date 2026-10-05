import "server-only";
import { redirect } from "next/navigation";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { pickText } from "@/lib/content";
import { config } from "@/lib/config";
import { formatDate, formatDateRange, formatDayTab, formatTime } from "@/lib/datetime";
import { activeWinnerWhere, ensureLotteryDraw } from "@/lib/lottery";
import { formatInstantInTimeZone } from "@/lib/timeZone";
import { photoUrls } from "@/lib/images";
import { ownerName } from "@/lib/owner";
import { getActiveNotificationsForUser } from "@/lib/platformNotifications";
import { moderationAllowsPublicPhoto, publicPhotoWhere } from "@/lib/photoVisibility";
import { getQuotaUsage } from "@/lib/quota";
import { getSiteSettings, resolveCreditTerm } from "@/lib/settings";
import type {
  StudioAccount,
  StudioBookingSettings,
  StudioBookings,
  StudioEventDetail,
  StudioEventSummary,
  StudioHome,
  StudioLottery,
  StudioPhoto,
  StudioSchedule
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
    redirect(`/${locale}/3d/u/${encodeURIComponent(user.username)}/studio/setup`);
  }
  return user;
}

/**
 * The first-run setup's guard: the signed-in photographer's own, and only
 * until it is done (admins skip it, as on the classic dashboard).
 */
export async function requireSetupUser(username: string, locale: string): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect(`/${locale}/3d/login`);
  const home = `/${locale}/3d/u/${encodeURIComponent(user.username)}/studio`;
  if (user.username !== username) redirect(`${home}/setup`);
  if (user.role === "admin" || (await getSiteSettings(user.id)).setupCompleted) redirect(home);
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
  coverPhotoId: true,
  // The card's picture when no cover is set: the album's first photo.
  photos: { where: { pendingBatchId: null }, orderBy: { sortOrder: "asc" }, take: 1, select: { id: true } },
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
    coverPhotoId: string | null;
    photos: { id: string }[];
    _count: { photos: number };
  }
): StudioEventSummary {
  const cover = event.coverPhotoId ?? event.photos[0]?.id;
  return {
    id: event.id,
    title: pickText(locale, event.titleEn, event.titleZh),
    dateLabel: formatDateRange(event.dateStart, event.dateEnd),
    location: event.location,
    published: event.published,
    photoCount: event._count.photos,
    cover: cover ? photoUrls(event.id, cover).thumb : ""
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
      descriptionZh: true,
      bookingEvent: { select: { id: true } }
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
      publicCount > 0 ? `/3d/u/${encodeURIComponent(user.username)}/albums/${encodeURIComponent(event.slug)}` : null,
    bookingId: event.bookingEvent?.id ?? null
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

const dayRange = (days: { date: Date }[]) =>
  days.length > 0 ? formatDateRange(days[0].date, days[days.length - 1].date) : "";

/** Every booking event of the photographer's, as the classic bookings list orders them. */
export async function loadStudioBookings(user: User, locale: string): Promise<StudioBookings> {
  const [settings, events] = await Promise.all([
    getSiteSettings(user.id),
    prisma.bookingEvent.findMany({
      where: { ownerId: user.id },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      include: {
        days: { orderBy: { date: "asc" }, select: { date: true } },
        lotteryDraw: { select: { id: true } },
        slots: { include: { _count: { select: { bookings: { where: { status: "confirmed" } } } } } }
      }
    })
  ]);
  return {
    account: studioAccount(user),
    bookingEnabled: settings.bookingEnabled,
    events: events.map((event) => ({
      id: event.id,
      title: pickText(locale, event.titleEn, event.titleZh),
      dates: dayRange(event.days),
      location: event.location,
      dayCount: event.days.length,
      open: settings.bookingEnabled && event.open,
      booked: event.slots.reduce((n, s) => n + s._count.bookings, 0),
      capacity: event.slots.reduce((n, s) => n + s.capacity, 0),
      hasLottery: event.lotteryEnabled || Boolean(event.lotteryDraw)
    }))
  };
}

/** One booking event's days and slots, with every booking, as the classic schedule tab shows them. */
export async function loadStudioSchedule(user: User, id: string, locale: string): Promise<StudioSchedule | null> {
  const event = await prisma.bookingEvent.findFirst({
    where: { id, ownerId: user.id },
    include: {
      lotteryDraw: { select: { id: true } },
      days: {
        orderBy: { date: "asc" },
        include: {
          slots: { orderBy: { startTime: "asc" }, include: { bookings: { orderBy: { createdAt: "asc" } } } }
        }
      }
    }
  });
  if (!event) return null;
  const settings = await getSiteSettings(user.id);
  const base = config.appBaseUrl();
  return {
    id: event.id,
    title: pickText(locale, event.titleEn, event.titleZh),
    dates: dayRange(event.days),
    location: event.location,
    open: event.open,
    bookingEnabled: settings.bookingEnabled,
    shareUrl: `${base}/${locale}/book/${event.token}`,
    galleryId: event.galleryEventId,
    lottery: event.lotteryEnabled || Boolean(event.lotteryDraw),
    priceEnabled: settings.bookingPriceEnabled,
    allowMultiDaySync: event.days.length > 1 && !event.slotsInitialized && event.days.every((day) => day.slots.length === 0),
    days: event.days.map((day) => ({
      id: day.id,
      label: formatDayTab(day.date, locale),
      slots: day.slots.map((slot) => ({
        id: slot.id,
        start: formatTime(slot.startTime),
        end: formatTime(slot.endTime),
        capacity: slot.capacity,
        booked: slot.bookings.filter((b) => b.status === "confirmed").length,
        price: settings.bookingPriceEnabled ? slot.pricePerPerson : "",
        description: pickText(locale, slot.descriptionEn, slot.descriptionZh),
        bookings: slot.bookings.map((b) => ({
          id: b.id,
          status: b.status,
          name: b.name,
          subject: b.subject,
          contact: [b.contactMethod, b.contactValue].filter(Boolean).join(": "),
          notes: b.notes,
          bookedAt: formatInstantInTimeZone(b.createdAt, locale, settings.timeZone),
          manageUrl: `${base}/${b.locale}/my-booking/${b.cancelToken}`
        }))
      }))
    }))
  };
}

/** A booking event's settings form, as the classic overview and advanced tabs fill it. */
export async function loadStudioBookingSettings(user: User, id: string, locale: string): Promise<StudioBookingSettings | null> {
  const event = await prisma.bookingEvent.findFirst({
    where: { id, ownerId: user.id },
    include: { lotteryDraw: { select: { id: true } }, days: { orderBy: { date: "asc" }, select: { date: true } } }
  });
  if (!event) return null;
  const settings = await getSiteSettings(user.id);
  return {
    id: event.id,
    title: pickText(locale, event.titleEn, event.titleZh),
    titleEn: event.titleEn,
    titleZh: event.titleZh,
    dates: event.days.map((day) => formatDate(day.date)),
    location: event.location,
    descriptionEn: event.descriptionEn,
    descriptionZh: event.descriptionZh,
    visitorEditsEnabled: event.visitorEditsEnabled,
    visitorEditCutoffHours: event.visitorEditCutoffHours,
    open: event.open,
    bookingEnabled: settings.bookingEnabled,
    showLottery: settings.lotteryEnabled || event.lotteryEnabled || Boolean(event.lotteryDraw),
    lotteryEnabled: event.lotteryEnabled,
    hasGallery: Boolean(event.galleryEventId)
  };
}

/**
 * A booking event's prize draw, made on first visit as the classic page
 * does. Null when the event isn't theirs; "off" when the draw was never
 * switched on, which the classic page also turns away.
 */
export async function loadStudioLottery(user: User, id: string, locale: string): Promise<StudioLottery | "off" | null> {
  const owned = await prisma.bookingEvent.findFirst({
    where: { id, ownerId: user.id },
    select: { id: true, lotteryEnabled: true, lotteryDraw: { select: { id: true } } }
  });
  if (!owned) return null;
  if (!owned.lotteryEnabled && !owned.lotteryDraw) return "off";
  if (!owned.lotteryDraw) await ensureLotteryDraw(owned.id);

  const [event, settings] = await Promise.all([
    prisma.bookingEvent.findFirst({
      where: { id, ownerId: user.id },
      include: {
        slots: { include: { bookings: { where: { status: "confirmed" }, include: { lotteryEntry: true } } } },
        lotteryDraw: {
          include: {
            entries: { orderBy: { createdAt: "asc" } },
            prizes: {
              orderBy: { sortOrder: "asc" },
              include: { _count: { select: { winners: { where: activeWinnerWhere } } } }
            }
          }
        }
      }
    }),
    getSiteSettings(user.id)
  ]);
  if (!event || !event.lotteryDraw) return null;
  const draw = event.lotteryDraw;
  return {
    id: event.id,
    title: pickText(locale, event.titleEn, event.titleZh),
    drawId: draw.id,
    shareUrl: `${config.appBaseUrl()}/${locale}/draw/${draw.token}`,
    open: draw.open,
    public: settings.lotteryEnabled && event.lotteryEnabled,
    prizes: draw.prizes.map((p) => ({ id: p.id, name: p.name, quantity: p.quantity, weight: p.weight, wonCount: p._count.winners })),
    entries: draw.entries.map((e) => ({ id: e.id, token: e.token, name: e.name, subject: e.subject, wonPrizeId: e.wonPrizeId })),
    available: event.slots
      .flatMap((slot) => slot.bookings)
      .filter((b) => !b.lotteryEntry)
      .map((b) => ({ id: b.id, name: b.name, subject: b.subject }))
  };
}
