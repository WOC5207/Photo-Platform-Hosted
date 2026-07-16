"use server";

import { randomUUID } from "crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { rateLimit } from "@/lib/rate-limit";
import { pickText } from "@/lib/content";
import { formatSlotRange } from "@/lib/datetime";
import { notifyBookingCreated } from "@/lib/notify";
import { getSiteSettings } from "@/lib/settings";
import { reserveSlot } from "@/lib/booking";
import { spinForEntry, uniqueEntryToken } from "@/lib/lottery";

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
  contactMethod: z.string().trim().min(1).max(60),
  contactValue: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(2000)
});

export async function createBooking(
  _prev: BookingFormState,
  formData: FormData
): Promise<BookingFormState> {
  if (!(await getSiteSettings()).bookingEnabled) return { error: "closed" };

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`book:${ip}`, { limit: 8, windowMs: 60 * 60 * 1000 })) {
    return { error: "rateLimited" };
  }

  const parsed = bookingSchema.safeParse({
    slotId: formData.get("slotId") ?? "",
    name: formData.get("name") ?? "",
    subject: formData.get("subject") ?? "",
    contactMethod: formData.get("contactMethod") ?? "",
    contactValue: formData.get("contactValue") ?? "",
    notes: formData.get("notes") ?? ""
  });
  if (!parsed.success) return { error: "validation" };
  const d = parsed.data;

  const cancelToken = randomUUID().replace(/-/g, "");

  // Atomic capacity check + insert; see reserveSlot for why it's locked.
  const result = await reserveSlot(d.slotId, {
    name: d.name,
    subject: d.subject,
    contactMethod: d.contactMethod,
    contactValue: d.contactValue,
    notes: d.notes,
    cancelToken
  });

  if (!result.ok) return { error: result.error };

  const locale = await getLocale();
  const manageUrl = `${config.appBaseUrl()}/${locale}/my-booking/${cancelToken}`;
  // Fire-and-forget notification hook (no-op until SMTP is configured)
  notifyBookingCreated({
    bookingId: cancelToken,
    name: d.name,
    subject: d.subject,
    contactMethod: d.contactMethod,
    contactValue: d.contactValue,
    eventTitle: pickText(
      locale,
      result.slot.bookingEvent.titleEn,
      result.slot.bookingEvent.titleZh
    ),
    slotStart: result.slot.startTime,
    slotEnd: result.slot.endTime,
    manageUrl
  }).catch(() => {});

  redirect(`/${locale}/my-booking/${cancelToken}?new=1`);
}

export async function cancelMyBooking(formData: FormData): Promise<void> {
  const cancelToken = formData.get("cancelToken");
  if (typeof cancelToken !== "string" || cancelToken.length > 100) return;

  await prisma.booking
    .update({
      where: { cancelToken },
      data: { status: "cancelled" }
    })
    .catch(() => {});
  revalidatePath("/", "layout");
}

// ── "Check your booking" lookup ──────────────────────────────────────────

export interface BookingLookupResult {
  cancelToken: string;
  eventTitle: string;
  slotLabel: string;
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
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
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
      lotteryDraw: { select: { id: true } },
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
  const lotteryLive = event.lotteryEnabled && !!event.lotteryDraw;
  const locale = await getLocale();
  const eventTitle = pickText(locale, event.titleEn, event.titleZh);

  const matches = event.slots
    .flatMap((s) => s.bookings.map((b) => ({ slot: s, booking: b })))
    .filter(
      ({ booking }) =>
        booking.name.trim().toLowerCase() === wantName &&
        booking.contactValue.trim().toLowerCase() === wantContact
    );

  if (matches.length === 0) return { error: "notFound" };

  const results: BookingLookupResult[] = matches.map(({ slot, booking }) => ({
    cancelToken: booking.cancelToken,
    eventTitle,
    slotLabel: formatSlotRange(slot.startTime, slot.endTime),
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
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
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
  if (!event.lotteryEnabled || !draw) {
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

  const result = await spinForEntry(entryId, draw.id);
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
