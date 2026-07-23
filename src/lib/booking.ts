import "server-only";
import { randomUUID } from "crypto";
import { Prisma, type BookingEvent, type TimeSlot } from "@prisma/client";
import { prisma } from "./db";

export interface BookingDetails {
  name: string;
  subject: string;
  contactMethod: string;
  contactValue: string;
  email: string;
  notes: string;
  cancelToken: string;
  // Site language the visitor booked in, stored on the booking so later emails
  // reach them in their own language (see Booking.locale in schema.prisma).
  locale: string;
}

export type ReserveSlotResult =
  | { ok: true; slot: TimeSlot & { bookingEvent: BookingEvent } }
  | { ok: false; error: "slotUnavailable" | "closed" | "slotFull" };

/**
 * Books one spot in a time slot if capacity allows, as a single atomic unit.
 * Lives here rather than inline in the server action so the concurrency
 * invariant it protects can be exercised directly by a test — the action
 * itself is unreachable from a test harness (it needs request context, and
 * its per-IP rate limit would throttle a concurrent run long before the
 * transaction ever saw the load).
 *
 * The SELECT ... FOR UPDATE takes a row lock on the slot for the rest of the
 * transaction, so two concurrent attempts on the last spot are serialized and
 * the second sees the first's booking in its count. Without it, Postgres'
 * READ COMMITTED default lets both reads observe capacity - 1 and both
 * inserts succeed. (This invariant previously rode on SQLite's serialized
 * writes via connection_limit=1, which Postgres does not give us.)
 *
 * Locking the slot row rather than raising the isolation level keeps bookings
 * for *different* slots fully parallel, and avoids serialization failures
 * that callers would have to catch and retry.
 */
export async function reserveSlot(
  slotId: string,
  details: BookingDetails
): Promise<ReserveSlotResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "TimeSlot" WHERE id = ${slotId} FOR UPDATE`;

    const slot = await tx.timeSlot.findUnique({
      where: { id: slotId },
      include: { bookingEvent: true }
    });
    if (!slot) return { ok: false, error: "slotUnavailable" } as const;
    if (!slot.bookingEvent.open) return { ok: false, error: "closed" } as const;

    const confirmed = await tx.booking.count({
      where: { timeSlotId: slot.id, status: "confirmed" }
    });
    if (confirmed >= slot.capacity) return { ok: false, error: "slotFull" } as const;

    await tx.booking.create({
      data: {
        timeSlotId: slot.id,
        name: details.name,
        subject: details.subject,
        contactMethod: details.contactMethod,
        contactValue: details.contactValue,
        email: details.email,
        notes: details.notes,
        cancelToken: details.cancelToken,
        locale: details.locale
      }
    });
    return { ok: true, slot } as const;
  });
}

function newToken(): string {
  return randomUUID().replace(/-/g, "");
}

export type MergeEventsResult =
  | { ok: true; targetId: string }
  | { ok: false; error: "invalid" | "lotteryConflict" };

/**
 * Consolidate `sourceIds` into `targetId` so they share the target's public
 * link. Every day/slot/booking under the sources is reassigned to the target
 * (same-date days are combined into one), then the emptied source events are
 * deleted. Confirmed bookings ride their slots untouched, so visitors' cancel
 * links keep working.
 *
 * Correctness under concurrent public bookings: the events are locked FOR
 * UPDATE, and the slot-reparenting UPDATEs take each TimeSlot's row lock — the
 * same lock reserveSlot holds — so a reservation and a merge on the same slot
 * serialize and the booking always lands under whichever event wins, never
 * lost. Lives here (not in the action) so this can be tested directly.
 */
export async function mergeEvents(
  ownerId: string,
  targetId: string,
  sourceIds: string[]
): Promise<MergeEventsResult> {
  const sources = [...new Set(sourceIds)].filter((id) => id !== targetId);
  if (sources.length === 0) return { ok: false, error: "invalid" };
  const allIds = [targetId, ...sources];

  const owned = await prisma.bookingEvent.findMany({
    where: { id: { in: allIds }, ownerId },
    select: { id: true, lotteryDraw: { select: { id: true } } }
  });
  if (owned.length !== allIds.length) return { ok: false, error: "invalid" };

  // A LotteryDraw is unique per event, so only one draw can survive the merge.
  const withDraw = owned.filter((event) => event.lotteryDraw);
  if (withDraw.length > 1) return { ok: false, error: "lotteryConflict" };
  const drawToReassign =
    withDraw.length === 1 && withDraw[0].id !== targetId ? withDraw[0].id : null;

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM "BookingEvent" WHERE id IN (${Prisma.join(
        allIds
      )}) FOR UPDATE`
    );

    // Track the target's days by calendar date so same-date source days combine
    // instead of violating @@unique([bookingEventId, date]).
    const targetDays = await tx.bookingDay.findMany({
      where: { bookingEventId: targetId },
      select: { id: true, date: true }
    });
    const targetDayByTime = new Map(
      targetDays.map((day) => [day.date.getTime(), day.id])
    );

    const sourceDays = await tx.bookingDay.findMany({
      where: { bookingEventId: { in: sources } },
      orderBy: { date: "asc" },
      select: { id: true, date: true }
    });

    for (const day of sourceDays) {
      const existing = targetDayByTime.get(day.date.getTime());
      if (existing) {
        await tx.timeSlot.updateMany({
          where: { bookingDayId: day.id },
          data: { bookingEventId: targetId, bookingDayId: existing }
        });
        await tx.bookingDay.delete({ where: { id: day.id } });
      } else {
        await tx.bookingDay.update({
          where: { id: day.id },
          data: { bookingEventId: targetId }
        });
        await tx.timeSlot.updateMany({
          where: { bookingDayId: day.id },
          data: { bookingEventId: targetId }
        });
        targetDayByTime.set(day.date.getTime(), day.id);
      }
    }

    if (drawToReassign) {
      await tx.lotteryDraw.update({
        where: { bookingEventId: drawToReassign },
        data: { bookingEventId: targetId }
      });
    }

    // Sources now hold no days/slots/draw, so nothing cascades away.
    await tx.bookingEvent.deleteMany({ where: { id: { in: sources } } });

    const earliest = await tx.bookingDay.findFirst({
      where: { bookingEventId: targetId },
      orderBy: { date: "asc" },
      select: { date: true }
    });
    if (earliest) {
      await tx.bookingEvent.update({
        where: { id: targetId },
        data: { date: earliest.date }
      });
    }
  });

  return { ok: true, targetId };
}

export type SplitEventResult =
  | { ok: true; newEventId: string }
  | { ok: false; error: "invalid" | "lotterySplit" };

/**
 * Break `dayIds` out of `eventId` into a brand-new event with its own public
 * link, leaving the remaining days (and the original link) in place. The moved
 * days keep their slots and bookings. Must leave at least one day behind and
 * move at least one out.
 */
export async function splitEvent(
  ownerId: string,
  eventId: string,
  dayIds: string[]
): Promise<SplitEventResult> {
  const splitIds = [...new Set(dayIds)];
  if (splitIds.length === 0) return { ok: false, error: "invalid" };

  const event = await prisma.bookingEvent.findFirst({
    where: { id: eventId, ownerId },
    include: {
      lotteryDraw: { select: { id: true } },
      days: { select: { id: true, date: true } }
    }
  });
  if (!event) return { ok: false, error: "invalid" };

  const dayById = new Map(event.days.map((day) => [day.id, day]));
  // Every requested day must belong to this event, and at least one must remain.
  if (
    !splitIds.every((id) => dayById.has(id)) ||
    splitIds.length >= event.days.length
  ) {
    return { ok: false, error: "invalid" };
  }

  // The new event has no prize draw, so moving a booking that is a lottery
  // entrant would strand its self-serve spin — refuse rather than orphan it.
  if (event.lotteryDraw) {
    const entrants = await prisma.lotteryEntry.count({
      where: { booking: { timeSlot: { bookingDayId: { in: splitIds } } } }
    });
    if (entrants > 0) return { ok: false, error: "lotterySplit" };
  }

  const earliestSplitDate = splitIds
    .map((id) => dayById.get(id)!.date)
    .reduce((min, date) => (date < min ? date : min));

  const newEventId = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "BookingEvent" WHERE id = ${eventId} FOR UPDATE`;

    const created = await tx.bookingEvent.create({
      data: {
        ownerId,
        token: newToken(),
        titleEn: event.titleEn,
        titleZh: event.titleZh,
        descriptionEn: event.descriptionEn,
        descriptionZh: event.descriptionZh,
        location: event.location,
        date: earliestSplitDate,
        open: event.open,
        lotteryEnabled: event.lotteryEnabled
      }
    });

    await tx.bookingDay.updateMany({
      where: { id: { in: splitIds } },
      data: { bookingEventId: created.id }
    });
    await tx.timeSlot.updateMany({
      where: { bookingDayId: { in: splitIds } },
      data: { bookingEventId: created.id }
    });

    const earliest = await tx.bookingDay.findFirst({
      where: { bookingEventId: eventId },
      orderBy: { date: "asc" },
      select: { date: true }
    });
    if (earliest) {
      await tx.bookingEvent.update({
        where: { id: eventId },
        data: { date: earliest.date }
      });
    }

    return created.id;
  });

  return { ok: true, newEventId };
}
