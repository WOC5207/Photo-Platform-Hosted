"use server";

import { randomUUID } from "crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { routing } from "@/i18n/routing";
import { prisma } from "@/lib/db";
import { clientIp } from "@/lib/clientIp";
import { config } from "@/lib/config";
import { rateLimit } from "@/lib/rate-limit";
import { pickText } from "@/lib/content";
import { formatSlotRange } from "@/lib/datetime";
import { notifyBookingCreated, notifyBookingCancelled } from "@/lib/notify";
import { getSiteSettings } from "@/lib/settings";
import { reserveSlot } from "@/lib/booking";
import { spinForEntry, uniqueEntryToken } from "@/lib/lottery";
import { findAvailablePublicDraw } from "@/lib/publicLottery";

export type BookingFormState = {
  error?:
    | "validation"
    | "slotFull"
    | "slotUnavailable"
    | "rateLimited"
    | "closed";
};

const bookingSchema = z.object({
  slotId: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  subject: z.string().trim().max(200),
  contactValue: z.string().trim().min(1).max(200),
  // Optional: a real email so we can send a confirmation and status updates.
  // Empty is allowed (the visitor may only want to give a WeChat, etc.); a
  // non-empty value must be a valid address.
  email: z.string().trim().max(200).email().or(z.literal("")),
  notes: z.string().trim().max(2000)
});

export async function createBooking(
  _prev: BookingFormState,
  formData: FormData
): Promise<BookingFormState> {
  const parsed = bookingSchema.safeParse({
    slotId: formData.get("slotId") ?? "",
    name: formData.get("name") ?? "",
    subject: formData.get("subject") ?? "",
    contactValue: formData.get("contactValue") ?? "",
    email: formData.get("email") ?? "",
    notes: formData.get("notes") ?? ""
  });
  if (!parsed.success) return { error: "validation" };
  const d = parsed.data;
  const ip = clientIp(await headers());

  // Keep random-but-well-formed slot IDs from turning this public action into
  // an unbounded database probe. The generous short-window limit protects the
  // lookup while the event-scoped limit below remains the visitor-facing gate.
  if (
    !rateLimit(`book-preflight:${ip}`, {
      limit: 120,
      windowMs: 60 * 1000
    })
  ) {
    return { error: "rateLimited" };
  }

  // "Booking enabled" is the slot owner's setting, so the slot has to be
  // resolved before it can be read — it is no longer one switch for the whole
  // deployment. reserveSlot re-reads the slot inside its lock; this lookup only
  // answers whose it is.
  const slot = await prisma.timeSlot.findUnique({
    where: { id: d.slotId },
    select: { bookingEvent: { select: { id: true, ownerId: true } } }
  });
  if (!slot) return { error: "slotUnavailable" };

  // Consume an attempt only after basic validation, and scope the limit to the
  // event so visitors on shared Wi-Fi do not block unrelated photographers.
  if (
    !rateLimit(`book:${slot.bookingEvent.id}:${ip}`, {
      limit: 30,
      windowMs: 60 * 60 * 1000
    })
  ) {
    return { error: "rateLimited" };
  }

  const settings = await getSiteSettings(slot.bookingEvent.ownerId);
  if (!settings.bookingEnabled) {
    return { error: "closed" };
  }

  const cancelToken = randomUUID().replace(/-/g, "");
  // The site language this visitor is booking in — stored on the booking so a
  // later status-change email (sent from the photographer's dashboard, in their
  // locale) still reaches this visitor in their own language.
  const locale = await getLocale();

  // Atomic capacity check + insert; see reserveSlot for why it's locked.
  const result = await reserveSlot(d.slotId, {
    name: d.name,
    subject: d.subject,
    // The method dropdown was removed — the visitor's free-text contact goes in
    // contactValue and the label snapshot is left empty for new bookings.
    contactMethod: "",
    contactValue: d.contactValue,
    email: d.email,
    notes: d.notes,
    cancelToken,
    locale
  });

  if (!result.ok) return { error: result.error };

  const manageUrl = `${config.appBaseUrl()}/${locale}/my-booking/${cancelToken}`;
  // The photographer's own contact address, if they set one — separate lookup
  // because reserveSlot returns the event but not its owner.
  const owner = await prisma.user.findUnique({
    where: { id: result.slot.bookingEvent.ownerId },
    select: { email: true }
  });
  // Fire-and-forget notification (no-op until SMTP is configured)
  notifyBookingCreated({
    bookingId: cancelToken,
    name: d.name,
    subject: d.subject,
    contactMethod: "",
    contactValue: d.contactValue,
    eventTitle: pickText(
      locale,
      result.slot.bookingEvent.titleEn,
      result.slot.bookingEvent.titleZh
    ),
    slotStart: result.slot.startTime,
    slotEnd: result.slot.endTime,
    timeZone: settings.timeZone,
    pricePerPerson: settings.bookingPriceEnabled
      ? result.slot.pricePerPerson
      : "",
    manageUrl,
    // The owner's own locale isn't known, so the dashboard deep-link uses the
    // platform default; the dashboard UI is bilingual either way.
    dashboardUrl: `${config.appBaseUrl()}/${routing.defaultLocale}/dashboard/bookings/${result.slot.bookingEvent.id}`,
    locale,
    visitorEmail: d.email,
    ownerEmail: owner?.email ?? ""
  }).catch(() => {});

  redirect(`/${locale}/my-booking/${cancelToken}?new=1`);
}

export async function cancelMyBooking(formData: FormData): Promise<void> {
  const cancelToken = formData.get("cancelToken");
  if (typeof cancelToken !== "string" || cancelToken.length > 100) return;

  // Read before writing so the notification has the event/slot to describe, and
  // so we can tell a real cancellation from a repeat click (below).
  const booking = await prisma.booking.findUnique({
    where: { cancelToken },
    include: { timeSlot: { include: { bookingEvent: true } } }
  });
  if (!booking) return;

  // The conditional write is the idempotency gate: concurrent requests may
  // both read the booking, but exactly one can transition and send notices.
  const transition = await prisma.booking.updateMany({
    where: { id: booking.id, status: "confirmed" },
    data: { status: "cancelled" }
  });
  if (transition.count !== 1) return;
  revalidatePath("/", "layout");

  // The visitor's own language, captured when they booked — not getLocale(),
  // which here is only the locale of the page the cancel was clicked from.
  const locale = booking.locale;
  const event = booking.timeSlot.bookingEvent;
  const settings = await getSiteSettings(event.ownerId);
  const owner = await prisma.user.findUnique({
    where: { id: event.ownerId },
    select: { email: true }
  });
  const manageUrl = `${config.appBaseUrl()}/${locale}/my-booking/${cancelToken}`;
  notifyBookingCancelled({
    bookingId: cancelToken,
    name: booking.name,
    subject: booking.subject,
    contactMethod: booking.contactMethod,
    contactValue: booking.contactValue,
    eventTitle: pickText(locale, event.titleEn, event.titleZh),
    slotStart: booking.timeSlot.startTime,
    slotEnd: booking.timeSlot.endTime,
    timeZone: settings.timeZone,
    pricePerPerson: settings.bookingPriceEnabled
      ? booking.timeSlot.pricePerPerson
      : "",
    manageUrl,
    dashboardUrl: `${config.appBaseUrl()}/${routing.defaultLocale}/dashboard/bookings/${event.id}`,
    locale,
    visitorEmail: booking.email,
    ownerEmail: owner?.email ?? ""
  }).catch(() => {});
}

// ── "Check your booking" lookup ──────────────────────────────────────────

export interface BookingLookupResult {
  cancelToken: string;
  eventTitle: string;
  slotLabel: string;
  pricePerPerson: string;
  name: string;
  subject: string;
  cancelled: boolean;
  // Whether the wheel is currently spinnable for this booking (lottery on for
  // the event and the admin has opened self-serve spinning).
  lotteryLive: boolean;
  // Prize name if this booking already spun and won, else null.
  prizeName: string | null;
}

export type BookingLookupState = {
  error?: "validation" | "rateLimited" | "notFound";
  results?: BookingLookupResult[];
};

const lookupSchema = z.object({
  eventToken: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  contactValue: z.string().trim().min(1).max(200)
});

/**
 * Finds a visitor's own confirmed/cancelled bookings for one event by the CN
 * (name) + contact value they booked with — the self-serve way back in when
 * they don't have their private manage link. Scoped to a single event (the
 * button lives on that event's page) so identical CNs across unrelated events
 * never collide. Matching is done case-insensitively in JS, mirroring the
 * self-entry match in draw/actions.ts.
 */
export async function lookupMyBooking(
  _prev: BookingLookupState,
  formData: FormData
): Promise<BookingLookupState> {
  const ip = clientIp(await headers());
  if (!rateLimit(`book-lookup:${ip}`, { limit: 20, windowMs: 60 * 60 * 1000 })) {
    return { error: "rateLimited" };
  }

  const parsed = lookupSchema.safeParse({
    eventToken: formData.get("eventToken") ?? "",
    name: formData.get("name") ?? "",
    contactValue: formData.get("contactValue") ?? ""
  });
  if (!parsed.success) return { error: "validation" };
  const d = parsed.data;

  const event = await prisma.bookingEvent.findUnique({
    where: { token: d.eventToken },
    include: {
      lotteryDraw: { select: { token: true } },
      slots: {
        include: {
          bookings: {
            include: { lotteryEntry: { include: { wonPrize: true } } }
          }
        }
      }
    }
  });
  if (!event) return { error: "notFound" };

  const wantName = d.name.toLowerCase();
  const wantContact = d.contactValue.toLowerCase();
  const locale = await getLocale();
  const eventTitle = pickText(locale, event.titleEn, event.titleZh);
  const settings = await getSiteSettings(event.ownerId);

  const matches = event.slots
    .flatMap((s) => s.bookings.map((b) => ({ slot: s, booking: b })))
    .filter(
      ({ booking }) =>
        booking.name.trim().toLowerCase() === wantName &&
        booking.contactValue.trim().toLowerCase() === wantContact
    );

  if (matches.length === 0) return { error: "notFound" };
  const lotteryLive = event.lotteryDraw
    ? Boolean(await findAvailablePublicDraw(event.lotteryDraw.token))
    : false;

  const results: BookingLookupResult[] = matches.map(({ slot, booking }) => ({
    cancelToken: booking.cancelToken,
    eventTitle,
    slotLabel: formatSlotRange(slot.startTime, slot.endTime),
    pricePerPerson: settings.bookingPriceEnabled ? slot.pricePerPerson : "",
    name: booking.name,
    subject: booking.subject,
    cancelled: booking.status === "cancelled",
    lotteryLive,
    prizeName: booking.lotteryEntry?.wonPrize?.name ?? null
  }));

  return { results };
}

// ── Booking-linked wheel spin ────────────────────────────────────────────

export type BookingSpinResult =
  | {
      ok: true;
      winner: { prizeId: string; prizeName: string };
    }
  | {
      ok: false;
      error:
        | "rateLimited"
        | "notReady"
        | "notFound"
        | "alreadySpun"
        | "noPrizesLeft";
    };

const SPIN_ERROR_MAP = {
  not_found: "notFound",
  already_spun: "alreadySpun",
  no_prizes_left: "noPrizesLeft"
} as const;

/**
 * Self-serve spin for a booker, identified by their private cancelToken. The
 * booking is lazily turned into a LotteryEntry on the first spin (so bookings
 * made before lottery was enabled still work — see req 3), then the prize is
 * chosen by the shared weighted draw in spinForEntry. Gated solely on the
 * event's lotteryEnabled flag (plus a draw existing) — enabling lottery is all
 * it takes for visitors to spin.
 */
export async function spinMyBooking(
  cancelToken: string
): Promise<BookingSpinResult> {
  const ip = clientIp(await headers());
  if (!rateLimit(`book-spin:${ip}`, { limit: 20, windowMs: 60 * 60 * 1000 })) {
    return { ok: false, error: "rateLimited" };
  }

  if (typeof cancelToken !== "string" || !/^[a-z0-9]+$/.test(cancelToken)) {
    return { ok: false, error: "notFound" };
  }

  const booking = await prisma.booking.findUnique({
    where: { cancelToken },
    include: {
      lotteryEntry: true,
      timeSlot: {
        include: { bookingEvent: { include: { lotteryDraw: true } } }
      }
    }
  });
  if (!booking || booking.status !== "confirmed") {
    return { ok: false, error: "notFound" };
  }

  const event = booking.timeSlot.bookingEvent;
  const draw = event.lotteryDraw;
  if (!draw || !(await findAvailablePublicDraw(draw.token))) {
    return { ok: false, error: "notReady" };
  }

  // Lazily materialize the entry for this booking (bookingId is unique, so a
  // second concurrent spin can't create a duplicate).
  let entryId = booking.lotteryEntry?.id;
  if (!entryId) {
    const token = await uniqueEntryToken(draw.id);
    const created = await prisma.lotteryEntry
      .create({
        data: {
          drawId: draw.id,
          bookingId: booking.id,
          name: booking.name,
          subject: booking.subject,
          token
        }
      })
      .catch(async () => {
        // Lost a race — reuse whatever entry now exists for this booking.
        return prisma.lotteryEntry.findUnique({
          where: { bookingId: booking.id }
        });
      });
    entryId = created?.id;
  }
  if (!entryId) return { ok: false, error: "notFound" };

  const result = await spinForEntry(entryId, draw.id, true);
  revalidatePath("/", "layout");
  if (result.ok) {
    return {
      ok: true,
      winner: {
        prizeId: result.winner.prizeId,
        prizeName: result.winner.prizeName
      }
    };
  }
  return { ok: false, error: SPIN_ERROR_MAP[result.error] };
}
