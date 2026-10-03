"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { clientIp } from "@/lib/clientIp";
import { rateLimit } from "@/lib/rate-limit";
import { config } from "@/lib/config";
import { notifyBookingLink } from "@/lib/notify";
import { getRememberedBookingIds, rememberBookings } from "@/lib/visitorSession";
import { bookingRecipientAllowed } from "@/lib/bookingRecipientLimit";
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
  const state = await placeBookings(formData);
  if (state.bookings?.length === 1) {
    redirect(`/${await getLocale()}/my-booking/${state.bookings[0].cancelToken}?new=1`);
  }
  return state;
}

/**
 * The 3D site's booking form. Same checks, limits and emails as
 * createBooking, but a single booking stays on the schedule board, which
 * stamps it and shows its manage link, instead of opening the classic page.
 */
export async function createBooking3d(
  _prev: BookingFormState,
  formData: FormData
): Promise<BookingFormState> {
  return placeBookings(formData);
}

async function placeBookings(formData: FormData): Promise<BookingFormState> {
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
      bookingEvent: {
        select: { id: true, ownerId: true, token: true, open: true }
      }
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

  const settings = await getSiteSettings(event.ownerId);
  if (!event.open || !settings.bookingEnabled) {
    return { error: "closed" };
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

  if (
    !bookingRecipientAllowed(event.id, {
      email: d.email,
      contactValue: d.contactValue
    })
  ) {
    return { error: "rateLimited" };
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
  await rememberBookings(result.data.map((booking) => booking.bookingId));
  revalidatePath("/", "layout");
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

/** "jane@example.com" → "j•••@example.com", enough to recognise, not to reuse. */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "•••";
  return `${local.slice(0, 1)}•••@${domain}`;
}

export interface BookingLookupResult {
  // Stable list key; not a credential.
  bookingId: string;
  // The private manage link token, returned only for bookings made in this
  // browser. Otherwise the link is emailed to the address on file.
  cancelToken: string | null;
  // Masked address the link was just emailed to, when it was.
  linkEmailedTo: string | null;
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
      owner: { select: { status: true } },
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
  // A suspended photographer's booking pages are gone (see the book layout),
  // so their bookings are not discoverable here either.
  if (!event || event.owner.status !== "active") return { error: "notFound" };

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

  // A name and contact value are often public in these communities, so they
  // are not enough to hand over the private manage link (which can cancel,
  // move or read the booking). Only bookings made in this browser get it
  // directly; for the rest it is emailed to the address on file.
  const remembered = new Set(await getRememberedBookingIds());
  const results: BookingLookupResult[] = [];
  for (const { slot, booking } of matches) {
    const own = remembered.has(booking.id);
    let linkEmailedTo: string | null = null;
    if (
      !own &&
      booking.email &&
      config.isMailConfigured() &&
      rateLimit(`book-link-mail:${booking.id}`, {
        limit: 3,
        windowMs: 60 * 60 * 1000
      })
    ) {
      notifyBookingLink(
        {
          bookingId: booking.id,
          name: booking.name,
          subject: booking.subject,
          contactMethod: "",
          contactValue: booking.contactValue,
          eventTitle: pickText(booking.locale, event.titleEn, event.titleZh),
          slotStart: slot.startTime,
          slotEnd: slot.endTime,
          pricePerPerson: settings.bookingPriceEnabled ? slot.pricePerPerson : "",
          manageUrl: `${config.appBaseUrl()}/${booking.locale}/my-booking/${booking.cancelToken}`,
          locale: booking.locale,
          visitorEmail: booking.email,
          ownerEmail: ""
        },
        booking.status === "cancelled"
      ).catch(() => {});
      linkEmailedTo = maskEmail(booking.email);
      }
    results.push({
      bookingId: booking.id,
      cancelToken: own ? booking.cancelToken : null,
      linkEmailedTo,
      eventTitle,
      slotLabel: formatSlotRange(slot.startTime, slot.endTime),
      pricePerPerson: settings.bookingPriceEnabled ? slot.pricePerPerson : "",
      name: booking.name,
      subject: booking.subject,
      cancelled: booking.status === "cancelled",
      lotteryLive,
      prizeName: booking.lotteryEntry?.wonPrize?.name ?? null
    });
  }

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
