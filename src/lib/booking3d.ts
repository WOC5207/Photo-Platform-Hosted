import "server-only";
import { prisma } from "@/lib/db";
import { findOwner, ownerName } from "@/lib/owner";
import { pickText } from "@/lib/content";
import { formatDate, formatDateRange, formatDayTab, formatTime } from "@/lib/datetime";
import { getSiteSettings, resolveSubjectTerm } from "@/lib/settings";
import { isNaiveDateTimePast, wallClockNow } from "@/lib/timeZone";
import { findAvailablePublicDraw } from "@/lib/publicLottery";
import { getAuthorizedLotteryEntryIds } from "@/lib/visitorSession";
import { activeWinnerWhere } from "@/lib/lottery";
import type { BookingBoard, BookingSchedule, PrizeDraw } from "@/components/album3d/booking/types";

/**
 * Data for the 3D site's booking screens. Each loader runs the same queries
 * and checks as its classic page (the booking list, /book/[token] and
 * /draw/[token]), and also checks that the token belongs to the photographer
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
