"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { clientIp } from "@/lib/clientIp";
import { rateLimit } from "@/lib/rate-limit";
import { pickText } from "@/lib/content";
import { formatSlotRange } from "@/lib/datetime";
import { getSiteSettings } from "@/lib/settings";
import { findAvailablePublicDraw } from "@/lib/publicLottery";
import {
  cancelPublicBookingByToken,
  createPublicBookings
} from "@/lib/publicBookingService";
import { spinBookingLottery } from "@/lib/publicLotteryEntryService";

export type BookingFormState = {
  error?:
    | "validation"
    | "slotFull"
    | "slotUnavailable"
    | "rateLimited"
    | "closed";
  failedSlotId?: string;
  bookings?: {
    cancelToken: string;
    slotId: string;
  }[];
};

const bookingSchema = z.object({
  eventToken: z.string().min(1).max(100),
  slotIds: z.array(z.string().min(1).max(100)).min(1).max(20),
  subjects: z.array(z.string().trim().max(200)).min(1).max(20),
  name: z.string().trim().min(1).max(200),
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
    eventToken: formData.get("eventToken") ?? "",
    slotIds: formData.getAll("slotIds"),
    subjects: formData.getAll("subjects"),
    name: formData.get("name") ?? "",
    contactValue: formData.get("contactValue") ?? "",
    email: formData.get("email") ?? "",
    notes: formData.get("notes") ?? ""
  });
  if (!parsed.success) return { error: "validation" };
  const d = parsed.data;
  if (d.subjects.length !== d.slotIds.length) {
    return { error: "validation" };
  }
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
  // deployment. reserveSlots re-reads every slot inside its lock; this lookup
  // identifies the event and rejects cart items forged for another link.
  const uniqueSlotIds = Array.from(new Set(d.slotIds));
  if (uniqueSlotIds.length !== d.slotIds.length) {
    return { error: "validation" };
  }
  const slots = await prisma.timeSlot.findMany({
    where: { id: { in: uniqueSlotIds } },
    select: {
      id: true,
      bookingEvent: { select: { id: true, ownerId: true, token: true } }
    }
  });
  const event = slots[0]?.bookingEvent;
  if (
    slots.length !== uniqueSlotIds.length ||
    !event ||
    slots.some((slot) => slot.bookingEvent.id !== event.id) ||
    event.token !== d.eventToken
  ) {
    return { error: "slotUnavailable" };
  }

  // Consume an attempt only after basic validation, and scope the limit to the
  // event so visitors on shared Wi-Fi do not block unrelated photographers.
  if (
    !rateLimit(`book:${event.id}:${ip}`, {
      limit: 30,
      windowMs: 60 * 60 * 1000
    })
  ) {
    return { error: "rateLimited" };
  }

  const settings = await getSiteSettings(event.ownerId);
  if (!settings.bookingEnabled) {
    return { error: "closed" };
  }

  const locale = await getLocale();
  const result = await createPublicBookings({
    slots: d.slotIds.map((slotId, index) => ({
      slotId,
      subject: d.subjects[index]
    })),
    name: d.name,
    contactValue: d.contactValue,
    email: d.email,
    notes: d.notes,
    locale
  });
  if (!result.ok) {
    return { error: result.error, failedSlotId: result.slotId };
  }
  revalidatePath("/", "layout");
  if (result.data.length === 1) {
    redirect(`/${locale}/my-booking/${result.data[0].cancelToken}?new=1`);
  }
  return {
    bookings: result.data.map(({ cancelToken, slotId }) => ({
      cancelToken,
      slotId
    }))
  };
}

export async function cancelMyBooking(formData: FormData): Promise<void> {
  const cancelToken = formData.get("cancelToken");
  if (typeof cancelToken !== "string" || cancelToken.length > 100) return;

  const sharedResult = await cancelPublicBookingByToken(cancelToken);
  if (sharedResult.ok && sharedResult.data.changed) {
    revalidatePath("/", "layout");
  }
  return;
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

  const sharedResult = await spinBookingLottery(cancelToken);
  if (
    !sharedResult.ok &&
    (sharedResult.error === "notReady" ||
      sharedResult.error === "notFound")
  ) {
    return { ok: false, error: sharedResult.error };
  }
  revalidatePath("/", "layout");
  if (sharedResult.ok) {
    return {
      ok: true,
      winner: {
        prizeId: sharedResult.data.prizeId,
        prizeName: sharedResult.data.prizeName
      }
    };
  }
  return { ok: false, error: sharedResult.error };
}
