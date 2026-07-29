import "server-only";
import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
import { routing } from "@/i18n/routing";
import { reserveSlot, reserveSlots } from "@/lib/booking";
import { config } from "@/lib/config";
import { pickText } from "@/lib/content";
import { prisma } from "@/lib/db";
import {
  notifyBookingCancelled,
  notifyBookingCreated
} from "@/lib/notify";
import { getSiteSettings } from "@/lib/settings";

export interface PublicBookingInput {
  slotId: string;
  name: string;
  subject: string;
  contactValue: string;
  email: string;
  notes: string;
  locale: string;
  wechatIdentityId?: string;
  requireMiniappAvailability?: boolean;
}

export type CreatePublicBookingResult =
  | {
      ok: true;
      data: {
        bookingId: string;
        cancelToken: string;
        eventId: string;
      };
    }
  | {
      ok: false;
      error: "slotUnavailable" | "closed" | "slotFull";
    };

export type CreatePublicBookingsResult =
  | {
      ok: true;
      data: {
        bookingId: string;
        cancelToken: string;
        slotId: string;
        eventId: string;
      }[];
    }
  | {
      ok: false;
      error: "slotUnavailable" | "closed" | "slotFull";
      slotId?: string;
    };

export async function createPublicBookings(
  input: Omit<PublicBookingInput, "slotId"> & { slotIds: string[] }
): Promise<CreatePublicBookingsResult> {
  const slotIds = Array.from(new Set(input.slotIds));
  if (slotIds.length === 0 || slotIds.length !== input.slotIds.length) {
    return { ok: false, error: "slotUnavailable" };
  }

  const targets = await prisma.timeSlot.findMany({
    where: { id: { in: slotIds } },
    select: {
      id: true,
      bookingEvent: { select: { id: true, ownerId: true } }
    }
  });
  if (
    targets.length !== slotIds.length ||
    targets.some(
      (target) => target.bookingEvent.id !== targets[0]?.bookingEvent.id
    )
  ) {
    return { ok: false, error: "slotUnavailable" };
  }

  const settings = await getSiteSettings(targets[0].bookingEvent.ownerId);
  if (!settings.bookingEnabled) return { ok: false, error: "closed" };

  const cancelTokens = slotIds.map(() => randomUUID().replace(/-/g, ""));
  const result = await reserveSlots(slotIds, {
    name: input.name,
    subject: input.subject,
    contactMethod: "",
    contactValue: input.contactValue,
    email: input.email,
    notes: input.notes,
    locale: input.locale,
    wechatIdentityId: input.wechatIdentityId,
    requireMiniappAvailability: input.requireMiniappAvailability,
    cancelTokens
  });
  if (!result.ok) return result;

  const owner = await prisma.user.findUnique({
    where: { id: result.reservations[0].slot.bookingEvent.ownerId },
    select: { email: true }
  });
  for (const reservation of result.reservations) {
    const cancelToken = reservation.booking.cancelToken;
    notifyBookingCreated({
      bookingId: cancelToken,
      name: input.name,
      subject: input.subject,
      contactMethod: "",
      contactValue: input.contactValue,
      eventTitle: pickText(
        input.locale,
        reservation.slot.bookingEvent.titleEn,
        reservation.slot.bookingEvent.titleZh
      ),
      slotStart: reservation.slot.startTime,
      slotEnd: reservation.slot.endTime,
      timeZone: settings.timeZone,
      pricePerPerson: settings.bookingPriceEnabled
        ? reservation.slot.pricePerPerson
        : "",
      manageUrl: `${config.appBaseUrl()}/${input.locale}/my-booking/${cancelToken}`,
      dashboardUrl: `${config.appBaseUrl()}/${routing.defaultLocale}/dashboard/bookings/${reservation.slot.bookingEvent.id}`,
      locale: input.locale,
      visitorEmail: input.email,
      ownerEmail: owner?.email ?? ""
    }).catch(() => {});
  }

  return {
    ok: true,
    data: result.reservations.map(({ slot, booking }) => ({
      bookingId: booking.id,
      cancelToken: booking.cancelToken,
      slotId: slot.id,
      eventId: slot.bookingEvent.id
    }))
  };
}

/**
 * Shared Web/API booking core. The capacity decision remains in reserveSlot,
 * which holds the TimeSlot row lock; this layer owns feature gating, token
 * creation and the existing email side effects.
 */
export async function createPublicBooking(
  input: PublicBookingInput
): Promise<CreatePublicBookingResult> {
  const target = await prisma.timeSlot.findUnique({
    where: { id: input.slotId },
    select: {
      bookingEvent: { select: { id: true, ownerId: true } }
    }
  });
  if (!target) return { ok: false, error: "slotUnavailable" };

  const settings = await getSiteSettings(target.bookingEvent.ownerId);
  if (!settings.bookingEnabled) return { ok: false, error: "closed" };

  const cancelToken = randomUUID().replace(/-/g, "");
  const result = await reserveSlot(input.slotId, {
    name: input.name,
    subject: input.subject,
    contactMethod: "",
    contactValue: input.contactValue,
    email: input.email,
    notes: input.notes,
    cancelToken,
    locale: input.locale,
    wechatIdentityId: input.wechatIdentityId,
    requireMiniappAvailability: input.requireMiniappAvailability
  });
  if (!result.ok) return result;

  const owner = await prisma.user.findUnique({
    where: { id: result.slot.bookingEvent.ownerId },
    select: { email: true }
  });
  const manageUrl = `${config.appBaseUrl()}/${input.locale}/my-booking/${cancelToken}`;
  notifyBookingCreated({
    bookingId: cancelToken,
    name: input.name,
    subject: input.subject,
    contactMethod: "",
    contactValue: input.contactValue,
    eventTitle: pickText(
      input.locale,
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
    dashboardUrl: `${config.appBaseUrl()}/${routing.defaultLocale}/dashboard/bookings/${result.slot.bookingEvent.id}`,
    locale: input.locale,
    visitorEmail: input.email,
    ownerEmail: owner?.email ?? ""
  }).catch(() => {});

  return {
    ok: true,
    data: {
      bookingId: result.booking.id,
      cancelToken,
      eventId: result.slot.bookingEvent.id
    }
  };
}

const cancellableBookingInclude = {
  timeSlot: { include: { bookingEvent: true } }
} satisfies Prisma.BookingInclude;

type CancellableBooking = Prisma.BookingGetPayload<{
  include: typeof cancellableBookingInclude;
}>;

async function sendCancellationNotification(
  booking: CancellableBooking
): Promise<void> {
  const event = booking.timeSlot.bookingEvent;
  const settings = await getSiteSettings(event.ownerId);
  const owner = await prisma.user.findUnique({
    where: { id: event.ownerId },
    select: { email: true }
  });
  const manageUrl = `${config.appBaseUrl()}/${booking.locale}/my-booking/${booking.cancelToken}`;
  await notifyBookingCancelled({
    bookingId: booking.cancelToken,
    name: booking.name,
    subject: booking.subject,
    contactMethod: booking.contactMethod,
    contactValue: booking.contactValue,
    eventTitle: pickText(booking.locale, event.titleEn, event.titleZh),
    slotStart: booking.timeSlot.startTime,
    slotEnd: booking.timeSlot.endTime,
    timeZone: settings.timeZone,
    pricePerPerson: settings.bookingPriceEnabled
      ? booking.timeSlot.pricePerPerson
      : "",
    manageUrl,
    dashboardUrl: `${config.appBaseUrl()}/${routing.defaultLocale}/dashboard/bookings/${event.id}`,
    locale: booking.locale,
    visitorEmail: booking.email,
    ownerEmail: owner?.email ?? ""
  });
}

export type CancelPublicBookingResult =
  | { ok: true; data: { changed: boolean } }
  | { ok: false; error: "notFound" };

async function cancelBooking(
  where: Prisma.BookingWhereInput
): Promise<CancelPublicBookingResult> {
  const booking = await prisma.booking.findFirst({
    where,
    include: cancellableBookingInclude
  });
  if (!booking) return { ok: false, error: "notFound" };

  const transition = await prisma.booking.updateMany({
    where: {
      id: booking.id,
      status: "confirmed",
      // Repeat ownership conditions at the write boundary. This matters for
      // identity-scoped API calls if a concurrent import/delete is underway.
      ...where
    },
    data: { status: "cancelled" }
  });
  if (transition.count !== 1) {
    return { ok: true, data: { changed: false } };
  }

  // Preserve the Web action's fire-and-forget email semantics.
  sendCancellationNotification(booking).catch(() => {});
  return { ok: true, data: { changed: true } };
}

export async function cancelPublicBookingByToken(
  cancelToken: string
): Promise<CancelPublicBookingResult> {
  return cancelBooking({ cancelToken });
}

export async function cancelPublicBookingForIdentity(
  identityId: string,
  bookingId: string
): Promise<CancelPublicBookingResult> {
  return cancelBooking({ id: bookingId, wechatIdentityId: identityId });
}
