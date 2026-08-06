"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  findOwnedBooking,
  findOwnedBookingEvent,
  findOwnedSlot
} from "@/lib/ownership";
import { pickText } from "@/lib/content";
import { config } from "@/lib/config";
import { notifyBookingStatusChanged } from "@/lib/notify";
import {
  addSlotBatchForOwner,
  mergeEvents,
  splitEvent
} from "@/lib/booking";
import { getSiteSettings } from "@/lib/settings";
import { acceptBookingPriceNotice } from "@/lib/bookingPriceNotice";

export type BookingEventFormState = {
  error?:
    | "validation"
    | "priceNoticeRequired"
    | "noSlots"
    | "dayHasBookings"
    | "unknown";
  ok?: boolean;
};
export type SlotFormState = { error?: "validation"; ok?: boolean };

// The calendar day-picker submits its selected days as a JSON array of
// yyyy-mm-dd strings. At most this many days per event — a generous cap that
// still stops a crafted request from creating thousands of rows.
const MAX_EVENT_DAYS = 60;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse and normalize the selected days: deduped, sorted ascending, each a
 * valid yyyy-mm-dd. Returns null when the input is missing, malformed, empty or
 * over the cap — the caller treats that as a validation error.
 */
function parseSelectedDates(raw: FormDataEntryValue | null): string[] | null {
  if (typeof raw !== "string") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const days = Array.from(
    new Set(
      parsed.filter(
        (d): d is string =>
          typeof d === "string" &&
          DATE_PATTERN.test(d) &&
          !Number.isNaN(Date.parse(`${d}T00:00:00Z`))
      )
    )
  ).sort();
  if (days.length === 0 || days.length > MAX_EVENT_DAYS) return null;
  return days;
}

/** See the note in the events actions: signed in is not the same as owns it. */
async function guard(): Promise<{ locale: string; user: User }> {
  const locale = await getLocale();
  const user = await requireUser(locale);
  return { locale, user };
}

const bookingEventSchema = z
  .object({
    titleEn: z.string().trim().max(300),
    titleZh: z.string().trim().max(300),
    location: z.string().trim().max(300),
    descriptionEn: z.string().trim().max(5000),
    descriptionZh: z.string().trim().max(5000),
    visitorEditsEnabled: z.boolean(),
    visitorEditCutoffHours: z.coerce.number().int().min(0).max(8760),
    open: z.boolean()
  })
  .refine((d) => d.titleEn.length > 0 || d.titleZh.length > 0);

function parseBookingEventForm(formData: FormData) {
  return bookingEventSchema.safeParse({
    titleEn: formData.get("titleEn") ?? "",
    titleZh: formData.get("titleZh") ?? "",
    location: formData.get("location") ?? "",
    descriptionEn: formData.get("descriptionEn") ?? "",
    descriptionZh: formData.get("descriptionZh") ?? "",
    visitorEditsEnabled: formData.get("visitorEditsEnabled") === "on",
    visitorEditCutoffHours: formData.get("visitorEditCutoffHours") ?? "",
    open: formData.get("open") === "on"
  });
}

function toDate(value: string): Date {
  const d = new Date(`${value}T00:00:00Z`);
  return isNaN(d.getTime()) ? new Date() : d;
}

export async function createBookingEvent(
  _prev: BookingEventFormState,
  formData: FormData
): Promise<BookingEventFormState> {
  const { locale, user } = await guard();
  const parsed = parseBookingEventForm(formData);
  const dates = parseSelectedDates(formData.get("dates"));
  if (!parsed.success || !dates) return { error: "validation" };
  const d = parsed.data;
  const enablePriceDisplay = formData.get("enablePriceDisplay") === "on";
  const acceptedVersion = Number(
    formData.get("bookingPriceNoticeAcceptedVersion")
  );

  const result = await prisma.$transaction(async (tx) => {
    if (enablePriceDisplay) {
      const acceptance = await acceptBookingPriceNotice(tx, {
        ownerId: user.id,
        acceptedVersion,
        locale
      });
      if (!acceptance.ok) return { error: "priceNoticeRequired" as const };
      await tx.siteSettings.upsert({
        where: { ownerId: user.id },
        create: { ownerId: user.id, ...acceptance.acceptance },
        update: acceptance.acceptance
      });
    }

    const event = await tx.bookingEvent.create({
      data: {
        ownerId: user.id,
        token: randomUUID().replace(/-/g, ""),
        titleEn: d.titleEn,
        titleZh: d.titleZh,
        descriptionEn: d.descriptionEn,
        descriptionZh: d.descriptionZh,
        location: d.location,
        visitorEditsEnabled: d.visitorEditsEnabled,
        visitorEditCutoffHours: d.visitorEditCutoffHours,
        // `date` is the denormalized earliest day; the days themselves are the
        // source of truth (dates is sorted ascending).
        date: toDate(dates[0]),
        // A new event cannot have slots yet, so it always starts as a closed
        // draft. The edit action below is the only path that can publish it and
        // enforces the public-booking prerequisites before doing so.
        open: false,
        days: { create: dates.map((day) => ({ date: toDate(day) })) }
      }
    });
    return { event };
  });
  if ("error" in result) return { error: result.error };

  revalidatePath("/", "layout");
  redirect(`/${locale}/dashboard/bookings/${result.event.id}`);
}

export async function updateBookingEvent(
  _prev: BookingEventFormState,
  formData: FormData
): Promise<BookingEventFormState> {
  const { user } = await guard();
  const id = formData.get("id");
  if (typeof id !== "string") return { error: "unknown" };
  const parsed = parseBookingEventForm(formData);
  const dates = parseSelectedDates(formData.get("dates"));
  if (!parsed.success || !dates) return { error: "validation" };
  const d = parsed.data;

  const existing = await findOwnedBookingEvent(id, user);
  if (!existing) return { error: "unknown" };

  if (d.open && !existing.open) {
    const slotCount = await prisma.timeSlot.count({
      where: { bookingEventId: existing.id }
    });
    if (slotCount === 0) return { error: "noSlots" };
  }

  // Reconcile the event's days with the calendar selection: keep the days that
  // are still selected, add the newly-selected ones, and drop the deselected
  // ones (their slots cascade). A day that already holds a confirmed booking
  // cannot be removed — that would silently orphan a visitor's reservation.
  const desiredTimes = new Set(dates.map((day) => toDate(day).getTime()));
  const currentDays = await prisma.bookingDay.findMany({
    where: { bookingEventId: existing.id },
    select: { id: true, date: true }
  });
  const currentTimes = new Set(currentDays.map((day) => day.date.getTime()));
  const removedDayIds = currentDays
    .filter((day) => !desiredTimes.has(day.date.getTime()))
    .map((day) => day.id);
  const addedDates = dates.filter(
    (day) => !currentTimes.has(toDate(day).getTime())
  );

  if (removedDayIds.length > 0) {
    const blocked = await prisma.bookingDay.count({
      where: {
        id: { in: removedDayIds },
        slots: { some: { bookings: { some: { status: "confirmed" } } } }
      }
    });
    if (blocked > 0) return { error: "dayHasBookings" };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.bookingEvent.update({
        where: { id: existing.id },
        data: {
          titleEn: d.titleEn,
          titleZh: d.titleZh,
          descriptionEn: d.descriptionEn,
          descriptionZh: d.descriptionZh,
          location: d.location,
          visitorEditsEnabled: d.visitorEditsEnabled,
          visitorEditCutoffHours: d.visitorEditCutoffHours,
          date: toDate(dates[0]),
          open: d.open
        }
      });
      if (addedDates.length > 0) {
        await tx.bookingDay.createMany({
          data: addedDates.map((day) => ({
            bookingEventId: existing.id,
            date: toDate(day)
          }))
        });
      }
      if (removedDayIds.length > 0) {
        await tx.bookingDay.deleteMany({ where: { id: { in: removedDayIds } } });
      }
    });
  } catch {
    return { error: "unknown" };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteBookingEvent(formData: FormData): Promise<void> {
  const { locale, user } = await guard();
  const id = formData.get("id");
  if (typeof id !== "string") return;

  // Was an unscoped delete straight from the posted id — it took any event,
  // and its slots, bookings and lottery draw down with it via cascade.
  const event = await findOwnedBookingEvent(id, user);
  if (!event) return;

  await prisma.bookingEvent.delete({ where: { id: event.id } }).catch(() => {});
  revalidatePath("/", "layout");
  redirect(`/${locale}/dashboard/bookings`);
}

const slotsSchema = z.object({
  bookingDayId: z.string().min(1),
  // Time of day for the first slot on the chosen day (the day itself is fixed
  // by which tab the admin is on), as "HH:MM".
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  slotMinutes: z.coerce.number().int().min(5).max(24 * 60),
  slotCount: z.coerce.number().int().min(1).max(100),
  capacity: z.coerce.number().int().min(1).max(1000),
  pricePerPerson: z.string().trim().max(60),
  descriptionEn: z.string().trim().max(120),
  descriptionZh: z.string().trim().max(120),
  syncAcrossDays: z.boolean()
});

export async function addSlots(
  _prev: SlotFormState,
  formData: FormData
): Promise<SlotFormState> {
  const { user } = await guard();

  const parsed = slotsSchema.safeParse({
    bookingDayId: formData.get("bookingDayId") ?? "",
    startTime: formData.get("startTime") ?? "",
    slotMinutes: formData.get("slotMinutes") ?? "",
    slotCount: formData.get("slotCount") ?? "",
    capacity: formData.get("capacity") ?? "",
    pricePerPerson: formData.get("pricePerPerson") ?? "",
    descriptionEn: formData.get("descriptionEn") ?? "",
    descriptionZh: formData.get("descriptionZh") ?? "",
    syncAcrossDays: formData.get("syncAcrossDays") === "on"
  });
  if (!parsed.success) return { error: "validation" };

  const settings = await getSiteSettings(user.id);
  const added = await addSlotBatchForOwner(user.id, {
    ...parsed.data,
    // The site-level gate is enforced on the server too. A handcrafted form
    // post cannot store a new display price while the feature is disabled.
    pricePerPerson: settings.bookingPriceEnabled
      ? parsed.data.pricePerPerson
      : ""
  });
  if (!added) return { error: "validation" };

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteSlot(formData: FormData): Promise<void> {
  const { user } = await guard();
  const slotId = formData.get("slotId");
  if (typeof slotId !== "string") return;

  const slot = await findOwnedSlot(slotId, user);
  if (!slot) return;

  await prisma.timeSlot.delete({ where: { id: slot.id } }).catch(() => {});
  revalidatePath("/", "layout");
}

export type BookingStatusState = { error?: "slotFull"; ok?: boolean };
type BookingStatusTransition = BookingStatusState & { changed?: boolean };

/**
 * Email the visitor that the photographer changed their booking's status. Only
 * fired on a real transition by the callers below (never on a repeat submit),
 * and a no-op unless the booking carries an email. Fire-and-forget: the fetch is
 * awaited but the send is not, so the dashboard action never waits on SMTP.
 */
async function emailVisitorBookingStatus(
  bookingId: string,
  status: "confirmed" | "cancelled"
): Promise<void> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { timeSlot: { include: { bookingEvent: true } } }
  });
  if (!booking || !booking.email) return;
  const event = booking.timeSlot.bookingEvent;
  const settings = await getSiteSettings(event.ownerId);
  // The visitor's language, not the photographer's dashboard locale — this
  // email is going to the visitor, who may have booked in the other language.
  const locale = booking.locale;
  notifyBookingStatusChanged(
    {
      bookingId: booking.cancelToken,
      name: booking.name,
      subject: booking.subject,
      contactMethod: booking.contactMethod,
      contactValue: booking.contactValue,
      eventTitle: pickText(locale, event.titleEn, event.titleZh),
      slotStart: booking.timeSlot.startTime,
      slotEnd: booking.timeSlot.endTime,
      pricePerPerson: settings.bookingPriceEnabled
        ? booking.timeSlot.pricePerPerson
        : "",
      manageUrl: `${config.appBaseUrl()}/${locale}/my-booking/${booking.cancelToken}`,
      locale,
      visitorEmail: booking.email,
      ownerEmail: ""
    },
    status
  ).catch(() => {});
}

export async function setBookingStatus(
  _prev: BookingStatusState,
  formData: FormData
): Promise<BookingStatusState> {
  const { user } = await guard();
  const bookingId = formData.get("bookingId");
  const status = formData.get("status");
  if (
    typeof bookingId !== "string" ||
    (status !== "confirmed" && status !== "cancelled")
  )
    return {};

  const owned = await findOwnedBooking(bookingId, user);
  if (!owned) return {};

  // Cancelling always frees capacity, so it never conflicts. Restoring must
  // respect the slot's capacity — otherwise the freed spot may have been
  // re-booked, and restoring would overbook.
  if (status === "cancelled") {
    const transition = await prisma.booking.updateMany({
      where: { id: owned.id, status: "confirmed" },
      data: { status: "cancelled" }
    });
    if (transition.count === 1) {
      revalidatePath("/", "layout");
      await emailVisitorBookingStatus(owned.id, "cancelled");
    }
    return { ok: true };
  }

  const result: BookingStatusTransition = await prisma.$transaction(async (tx) => {
    // Same lock, and for the same reason, as the public booking path (see
    // reserveSlot in src/lib/booking.ts): this counts confirmed bookings and
    // then writes, so without holding the slot an admin restore racing a
    // visitor's booking — or another restore — lets both through on a stale
    // count and overbooks the slot.
    await tx.$queryRaw`SELECT id FROM "TimeSlot" WHERE id = ${owned.timeSlotId} FOR UPDATE`;

    const booking = await tx.booking.findUnique({
      where: { id: owned.id },
      include: { timeSlot: true }
    });
    if (!booking) return {};
    if (booking.status === "confirmed") return { ok: true, changed: false };

    const confirmed = await tx.booking.count({
      where: { timeSlotId: booking.timeSlotId, status: "confirmed" }
    });
    if (confirmed >= booking.timeSlot.capacity) return { error: "slotFull" };

    await tx.booking.update({
      where: { id: booking.id },
      data: { status: "confirmed" }
    });
    return { ok: true, changed: true };
  });

  if (result.ok) revalidatePath("/", "layout");
  // Only when a genuinely cancelled booking was restored (owned.status was
  // cancelled and the restore succeeded) — not when it was already confirmed
  // and not when the slot was full.
  if (result.ok && result.changed) {
    await emailVisitorBookingStatus(owned.id, "confirmed");
  }
  return result.error ? { error: result.error } : { ok: result.ok };
}

export type MergeEventsState = {
  error?: "invalid" | "lotteryConflict";
};

/**
 * Consolidate several booking events under one shared link. The target keeps
 * its link and details; the rest fold into it and are removed. Ownership and
 * the lottery gate live in mergeEvents (src/lib/booking.ts).
 */
export async function mergeBookingEvents(
  _prev: MergeEventsState,
  formData: FormData
): Promise<MergeEventsState> {
  const { locale, user } = await guard();
  const targetId = formData.get("targetId");
  const sourceIds = formData
    .getAll("sourceId")
    .filter((value): value is string => typeof value === "string");
  if (typeof targetId !== "string" || sourceIds.length === 0) {
    return { error: "invalid" };
  }

  const result = await mergeEvents(user.id, targetId, sourceIds);
  if (!result.ok) return { error: result.error };

  revalidatePath("/", "layout");
  redirect(`/${locale}/dashboard/bookings/${result.targetId}`);
}

export type SplitEventState = {
  error?: "invalid" | "lotterySplit";
};

/**
 * Break selected days out of an event into a new event with its own link. The
 * new event's edit page is where the photographer picks up that link, so we
 * redirect there. Validation and the lottery gate live in splitEvent.
 */
export async function splitBookingEvent(
  _prev: SplitEventState,
  formData: FormData
): Promise<SplitEventState> {
  const { locale, user } = await guard();
  const eventId = formData.get("eventId");
  const dayIds = formData
    .getAll("dayId")
    .filter((value): value is string => typeof value === "string");
  if (typeof eventId !== "string" || dayIds.length === 0) {
    return { error: "invalid" };
  }

  const result = await splitEvent(user.id, eventId, dayIds);
  if (!result.ok) return { error: result.error };

  revalidatePath("/", "layout");
  redirect(`/${locale}/dashboard/bookings/${result.newEventId}`);
}
