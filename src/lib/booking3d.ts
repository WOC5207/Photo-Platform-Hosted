import "server-only";
import { prisma } from "@/lib/db";
import { findOwner, ownerName } from "@/lib/owner";
import { pickText } from "@/lib/content";
import { formatDate, formatDateRange, formatDayTab, formatSlotRange, formatTime } from "@/lib/datetime";
import { getSiteSettings, resolveSubjectTerm } from "@/lib/settings";
import { isNaiveDateTimePast, wallClockNow } from "@/lib/timeZone";
import { isVisitorBookingEditWindowOpen, visitorBookingEditDeadline } from "@/lib/booking";
import { findAvailablePublicDraw } from "@/lib/publicLottery";
import { getAuthorizedLotteryEntryIds } from "@/lib/visitorSession";
import { activeWinnerWhere } from "@/lib/lottery";
import type { BookingBoard, BookingSchedule, MyBooking, PrizeDraw } from "@/components/album3d/booking/types";

/**
 * Data for the 3D site's booking screens. Each loader runs the same queries
 * and checks as its classic page (the booking list, /book/[token],
 * /draw/[token] and /my-booking/[token]), and also checks that the token belongs to the photographer
 * named in the address. Anything the classic page would 404 comes back null.
 */

const TOKEN = /^[a-z0-9]+$/;

/** A photographer's open booking events, as the classic booking list shows them. */
export async function loadBookingBoard(username: string, locale: string): Promise<BookingBoard | null> {
  const owner = await findOwner(username);
  if (!owner) return null;
  const settings = await getSiteSettings(owner.id);
  if (!settings.bookingEnabled) return null;
  const now = wallClockNow(settings.timeZone);

  const events = await prisma.bookingEvent.findMany({
    where: { ownerId: owner.id, open: true, slots: { some: { startTime: { gt: now } } } },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    include: {
      days: {
        where: { slots: { some: { startTime: { gt: now } } } },
        orderBy: { date: "asc" },
        select: { date: true }
      },
      slots: {
        where: { startTime: { gt: now } },
        include: { _count: { select: { bookings: { where: { status: "confirmed" } } } } }
      }
    }
  });

  return {
    username: owner.username,
    owner: ownerName(owner),
    events: events.map((event) => ({
      token: event.token,
      title: pickText(locale, event.titleEn, event.titleZh),
      dates:
        event.days.length > 0
          ? formatDateRange(event.days[0].date, event.days[event.days.length - 1].date)
          : formatDate(event.date),
      location: event.location,
      description: pickText(locale, event.descriptionEn, event.descriptionZh),
      remaining: event.slots.reduce((n, s) => n + Math.max(0, s.capacity - s._count.bookings), 0),
      slots: event.slots.length
    }))
  };
}

/** One booking event's upcoming slots, as /book/[token] lists them. */
export async function loadBookingSchedule(
  username: string,
  token: string,
  locale: string,
  defaultSubjectTerm: string
): Promise<BookingSchedule | null> {
  if (!TOKEN.test(token)) return null;
  const owner = await findOwner(username);
  if (!owner) return null;
  const event = await prisma.bookingEvent.findUnique({
    where: { token },
    include: {
      lotteryDraw: { select: { token: true } },
      days: {
        orderBy: { date: "asc" },
        include: {
          slots: {
            orderBy: { startTime: "asc" },
            include: { _count: { select: { bookings: { where: { status: "confirmed" } } } } }
          }
        }
      }
    }
  });
  if (!event || event.ownerId !== owner.id) return null;
  const settings = await getSiteSettings(owner.id);
  if (!settings.bookingEnabled) return null;

  const days = event.days
    .map((day) => ({
      ...day,
      slots: day.slots.filter((slot) => !isNaiveDateTimePast(slot.startTime, settings.timeZone))
    }))
    .filter((day) => day.slots.length > 0);
  const draw = event.lotteryDraw ? await findAvailablePublicDraw(event.lotteryDraw.token) : null;

  return {
    username: owner.username,
    owner: ownerName(owner),
    token,
    title: pickText(locale, event.titleEn, event.titleZh),
    dates: days.length > 0 ? formatDateRange(days[0].date, days[days.length - 1].date) : formatDate(event.date),
    location: event.location,
    description: pickText(locale, event.descriptionEn, event.descriptionZh),
    open: event.open,
    subjectTerm: resolveSubjectTerm(settings, locale, defaultSubjectTerm),
    drawToken: draw ? draw.token : null,
    days: days.map((day) => ({
      id: day.id,
      date: formatDate(day.date),
      label: formatDayTab(day.date, locale),
      slots: day.slots.map((slot) => ({
        id: slot.id,
        start: formatTime(slot.startTime),
        end: formatTime(slot.endTime),
        remaining: Math.max(0, slot.capacity - slot._count.bookings),
        capacity: slot.capacity,
        price: settings.bookingPriceEnabled ? slot.pricePerPerson : "",
        description: pickText(locale, slot.descriptionEn, slot.descriptionZh)
      }))
    }))
  };
}

/** A prize draw's prizes and this browser's entry, as /draw/[token] shows them. */
export async function loadPrizeDraw(username: string, token: string, locale: string): Promise<PrizeDraw | null> {
  if (!TOKEN.test(token)) return null;
  const owner = await findOwner(username);
  if (!owner) return null;
  const draw = await findAvailablePublicDraw(token);
  if (!draw || draw.bookingEvent.ownerId !== owner.id) return null;
  const event = draw.bookingEvent;

  const authorizedIds = await getAuthorizedLotteryEntryIds();
  const [entry, prizes] = await Promise.all([
    prisma.lotteryEntry.findFirst({
      where: { drawId: draw.id, id: { in: authorizedIds } },
      orderBy: { createdAt: "desc" },
      select: { id: true, token: true, wonPrizeId: true }
    }),
    prisma.lotteryPrize.findMany({
      where: { drawId: draw.id },
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { winners: { where: activeWinnerWhere } } } }
    })
  ]);

  return {
    username: owner.username,
    owner: ownerName(owner),
    token,
    title: pickText(locale, event.titleEn, event.titleZh),
    dates: formatDate(event.date),
    location: event.location,
    description: pickText(locale, event.descriptionEn, event.descriptionZh),
    entry,
    prizes: prizes.map((p) => ({
      id: p.id,
      name: p.name,
      quantity: p.quantity,
      weight: p.weight,
      wonCount: p._count.winners
    }))
  };
}

/** A visitor's own booking by its cancel token, as /my-booking/[token] shows it. */
export async function loadMyBooking(
  username: string,
  token: string,
  locale: string,
  defaultSubjectTerm: string,
  /** "Price per person: {price}", for the edit form's time choices. */
  pricePerPerson: (price: string) => string
): Promise<MyBooking | null> {
  if (!TOKEN.test(token)) return null;
  const owner = await findOwner(username);
  if (!owner) return null;
  const booking = await prisma.booking.findUnique({
    where: { cancelToken: token },
    include: {
      lotteryEntry: { include: { wonPrize: true } },
      timeSlot: {
        include: {
          bookingEvent: {
            include: {
              lotteryDraw: {
                include: {
                  prizes: {
                    orderBy: { sortOrder: "asc" },
                    include: { _count: { select: { winners: { where: activeWinnerWhere } } } }
                  }
                }
              }
            }
          }
        }
      }
    }
  });
  if (!booking || booking.timeSlot.bookingEvent.ownerId !== owner.id) return null;

  const slot = booking.timeSlot;
  const event = slot.bookingEvent;
  // The event owner's settings, as on the classic page: their vocabulary and toggles apply.
  const settings = await getSiteSettings(owner.id);
  const cancelled = booking.status === "cancelled";
  const editOpen =
    !cancelled &&
    event.visitorEditsEnabled &&
    isVisitorBookingEditWindowOpen(slot.startTime, event.visitorEditCutoffHours, settings.timeZone);
  const priceText = (price: string) => (settings.bookingPriceEnabled && price ? price : "");

  const editableSlots = editOpen
    ? (
        await prisma.timeSlot.findMany({
          where: { bookingEventId: event.id, startTime: { gt: wallClockNow(settings.timeZone) } },
          include: { _count: { select: { bookings: { where: { status: "confirmed" } } } } },
          orderBy: { startTime: "asc" }
        })
      )
        .filter(
          (s) => s.id === booking.timeSlotId || (event.open && settings.bookingEnabled && s._count.bookings < s.capacity)
        )
        .map((s) => ({
          id: s.id,
          label: [
            formatSlotRange(s.startTime, s.endTime),
            pickText(locale, s.descriptionEn, s.descriptionZh),
            s.pricePerPerson && settings.bookingPriceEnabled ? pricePerPerson(s.pricePerPerson) : ""
          ]
            .filter(Boolean)
            .join(" · ")
        }))
    : [];

  // As on the classic page: the draw shows whenever the site and event have
  // it on and it has been set up, and never for a cancelled booking.
  const draw = event.lotteryDraw;
  const showDraw = settings.lotteryEnabled && event.lotteryEnabled && !!draw && !cancelled;
  const won = booking.lotteryEntry?.wonPrize ?? null;

  return {
    username: owner.username,
    owner: ownerName(owner),
    token,
    title: pickText(locale, event.titleEn, event.titleZh),
    location: event.location,
    day: formatDayTab(slot.startTime, locale),
    start: formatTime(slot.startTime),
    end: formatTime(slot.endTime),
    range: formatSlotRange(slot.startTime, slot.endTime),
    slotDescription: pickText(locale, slot.descriptionEn, slot.descriptionZh),
    price: priceText(slot.pricePerPerson),
    name: booking.name,
    subject: booking.subject,
    subjectTerm: resolveSubjectTerm(settings, locale, defaultSubjectTerm),
    cancelled,
    edit: cancelled
      ? null
      : {
          enabled: event.visitorEditsEnabled,
          open: editOpen,
          deadline: editOpen
            ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(
                visitorBookingEditDeadline(slot.startTime, event.visitorEditCutoffHours)
              )
            : "",
          cutoffHours: event.visitorEditCutoffHours,
          currentSlotId: booking.timeSlotId,
          slots: editableSlots,
          initial: editOpen
            ? {
                name: booking.name,
                subject: booking.subject,
                contactValue: booking.contactValue,
                email: booking.email,
                notes: booking.notes
              }
            : null
        },
    draw: showDraw
      ? {
          prizes: draw.prizes.map((p) => ({
            id: p.id,
            name: p.name,
            quantity: p.quantity,
            weight: p.weight,
            wonCount: p._count.winners
          }))
        }
      : null,
    wonPrize: won ? { id: won.id, name: won.name } : null
  };
}
