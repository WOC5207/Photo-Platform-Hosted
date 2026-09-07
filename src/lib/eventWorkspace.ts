import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { slugify, uniqueEventSlug } from "@/lib/slug";
import { pickText } from "@/lib/content";

export interface WorkspaceDetails {
  titleEn: string;
  titleZh: string;
  descriptionEn: string;
  descriptionZh: string;
  location: string;
  visitorEditsEnabled: boolean;
  visitorEditCutoffHours: number;
}

export function validEventDates(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || !raw.length || raw.length > 60) return null;
  if (raw.some(day => typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    Number.isNaN(Date.parse(day + "T00:00:00Z")) ||
    new Date(day + "T00:00:00Z").toISOString().slice(0, 10) !== day)) return null;
  return [...new Set(raw as string[])].sort();
}

/** Reuses existing rows and packed state when event days are revisited. */
export async function ensureDayChecklists(tx: Prisma.TransactionClient, ownerId: string, bookingEventId: string, locale: string) {
  const event = await tx.bookingEvent.findFirst({
    where: { id: bookingEventId, ownerId }, include: { days: true }
  });
  if (!event) return;
  for (const day of event.days) {
    await tx.equipmentChecklist.upsert({
      where: { bookingDayId: day.id }, update: {},
      create: {
        ownerId, bookingDayId: day.id, shootDate: day.date,
        name: (pickText(locale, event.titleEn, event.titleZh) + " · " + day.date.toISOString().slice(0, 10)).slice(0, 160)
      }
    });
  }
}

/** Call inside a transaction: gallery, booking page and day lists commit together. */
export async function createEventWorkspace(
  tx: Prisma.TransactionClient, ownerId: string, details: WorkspaceDetails,
  datesInput: string[], locale: string, galleryId?: string
) {
  const dates = validEventDates(datesInput);
  if (!dates) throw new Error("Invalid event dates");
  // Serializes per-owner slug allocation and duplicate legacy-gallery setup.
  const owners = await tx.$queryRaw<{ id: string }[]> `SELECT id FROM "User" WHERE id = ${ownerId} FOR UPDATE`;
  if (owners.length !== 1) throw new Error("Owner not found");
  let gallery = galleryId ? await tx.event.findFirst({
    where: { id: galleryId, ownerId }, include: { bookingEvent: { select: { id: true } } }
  }) : null;
  if (galleryId && !gallery) throw new Error("Gallery not found");
  if (gallery?.bookingEvent) {
    await ensureDayChecklists(tx, ownerId, gallery.bookingEvent.id, locale);
    return { galleryId: gallery.id, bookingId: gallery.bookingEvent.id };
  }
  if (!gallery) {
    gallery = await tx.event.create({
      data: {
        ownerId, slug: await uniqueEventSlug(ownerId, slugify(details.titleEn || details.titleZh), undefined, tx),
        titleEn: details.titleEn, titleZh: details.titleZh, location: details.location,
        descriptionEn: details.descriptionEn, descriptionZh: details.descriptionZh,
        dateStart: new Date(dates[0] + "T00:00:00Z"),
        dateEnd: new Date(dates[dates.length - 1] + "T00:00:00Z"), published: false
      },
      include: { bookingEvent: { select: { id: true } } }
    });
  }
  const booking = await tx.bookingEvent.create({
    data: {
      ...details, ownerId, galleryEventId: gallery.id,
      token: randomUUID().replace(/-/g, ""), date: new Date(dates[0] + "T00:00:00Z"),
      open: false, days: { create: dates.map(day => ({ date: new Date(day + "T00:00:00Z") })) }
    }
  });
  await ensureDayChecklists(tx, ownerId, booking.id, locale);
  return { galleryId: gallery.id, bookingId: booking.id };
}

/** Explicit opt-in for a legacy booking: preserve its token, slots and lists. */
export async function addGalleryToBooking(tx: Prisma.TransactionClient, ownerId: string, bookingId: string, locale: string) {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${ownerId} FOR UPDATE`;
  const booking = await tx.bookingEvent.findFirst({
    where: { id: bookingId, ownerId }, include: { days: { orderBy: { date: "asc" } } }
  });
  if (!booking) return null;
  if (booking.galleryEventId) return booking.galleryEventId;
  const gallery = await tx.event.create({
    data: {
      ownerId, slug: await uniqueEventSlug(ownerId, slugify(booking.titleEn || booking.titleZh), undefined, tx),
      titleEn: booking.titleEn, titleZh: booking.titleZh,
      descriptionEn: booking.descriptionEn, descriptionZh: booking.descriptionZh,
      location: booking.location, dateStart: booking.days[0]?.date ?? booking.date,
      dateEnd: booking.days.at(-1)?.date ?? booking.date, published: false
    }
  });
  await tx.bookingEvent.update({ where: { id: booking.id }, data: { galleryEventId: gallery.id } });
  await ensureDayChecklists(tx, ownerId, booking.id, locale);
  return gallery.id;
}
