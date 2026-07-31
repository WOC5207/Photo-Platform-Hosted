import "server-only";
import { randomUUID } from "crypto";
import {
  Prisma,
  type Booking,
  type BookingEvent,
  type TimeSlot
} from "@prisma/client";
import { prisma } from "./db";
import { DEFAULT_TIME_ZONE, isNaiveDateTimePast } from "./timeZone";
import { formatDate, parseNaiveDateTime } from "./datetime";

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
  wechatIdentityId?: string;
  // Recheck and lock the tenant's mini-program visibility at the insert
  // boundary. Web callers omit this and retain their existing behavior.
  requireMiniappAvailability?: boolean;
}

export type ReserveSlotResult =
  | { ok: true; slot: TimeSlot & { bookingEvent: BookingEvent }; booking: Booking }
  | {
      ok: false;
      error: "slotUnavailable" | "closed" | "slotFull";
      slotId?: string;
    };

export type ReserveSlotsResult =
  | {
      ok: true;
      reservations: {
        slot: TimeSlot & { bookingEvent: BookingEvent };
        booking: Booking;
      }[];
    }
  | {
      ok: false;
      error: "slotUnavailable" | "closed" | "slotFull";
      slotId?: string;
    };

export interface SlotBatchInput {
  bookingDayId: string;
  startTime: string;
  slotMinutes: number;
  slotCount: number;
  capacity: number;
  pricePerPerson: string;
  descriptionEn: string;
  descriptionZh: string;
  syncAcrossDays: boolean;
}

/**
 * Add one slot batch, optionally copying the first batch of a new multi-day
 * event to every day. The event row lock keeps two concurrent setup tabs from
 * both observing an empty schedule and producing duplicates.
 */
export async function addSlotBatchForOwner(
  ownerId: string,
  input: SlotBatchInput
): Promise<boolean> {
  const day = await prisma.bookingDay.findFirst({
    where: { id: input.bookingDayId, bookingEvent: { ownerId } }
  });
  if (!day) return false;

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "BookingEvent" WHERE id = ${day.bookingEventId} FOR UPDATE`;
    const event = await tx.bookingEvent.findFirst({
      where: { id: day.bookingEventId, ownerId },
      select: { open: true, slotsInitialized: true }
    });
    if (!event) return false;

    let targetDays = [day];
    if (input.syncAcrossDays) {
      const existingSlots = await tx.timeSlot.count({
        where: { bookingEventId: day.bookingEventId }
      });
      if (event.open || event.slotsInitialized || existingSlots > 0) {
        return false;
      }
      targetDays = await tx.bookingDay.findMany({
        where: { bookingEventId: day.bookingEventId },
        orderBy: { date: "asc" }
      });
      if (targetDays.length < 2) return false;
    }

    const slots = targetDays.flatMap((targetDay) => {
      const start = parseNaiveDateTime(
        `${formatDate(targetDay.date)}T${input.startTime}`
      );
      if (!start) return [];
      const finalEnd = new Date(
        start.getTime() + input.slotMinutes * input.slotCount * 60_000
      );
      const nextDayStart = new Date(start);
      nextDayStart.setUTCHours(24, 0, 0, 0);
      if (finalEnd.getTime() > nextDayStart.getTime()) return [];

      return Array.from({ length: input.slotCount }, (_, i) => {
        const slotStart = new Date(
          start.getTime() + i * input.slotMinutes * 60_000
        );
        return {
          bookingEventId: day.bookingEventId,
          bookingDayId: targetDay.id,
          startTime: slotStart,
          endTime: new Date(
            slotStart.getTime() + input.slotMinutes * 60_000
          ),
          capacity: input.capacity,
          pricePerPerson: input.pricePerPerson,
          descriptionEn: input.descriptionEn,
          descriptionZh: input.descriptionZh
        };
      });
    });
    if (slots.length !== targetDays.length * input.slotCount) return false;

    await tx.timeSlot.createMany({ data: slots });
    await tx.bookingEvent.update({
      where: { id: day.bookingEventId },
      data: { slotsInitialized: true }
    });
    return true;
  });
}

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

    if (details.requireMiniappAvailability) {
      // Keep owner suspension / tenant opt-out from racing the final insert.
      // FOR SHARE permits concurrent bookings while making either admin update
      // wait until this transaction has committed.
      await tx.$queryRaw`
        SELECT id FROM "User"
        WHERE id = ${slot.bookingEvent.ownerId}
        FOR SHARE
      `;
      await tx.$queryRaw`
        SELECT id FROM "SiteSettings"
        WHERE "ownerId" = ${slot.bookingEvent.ownerId}
        FOR SHARE
      `;
    }
    const settings = await tx.siteSettings.findUnique({
      where: { ownerId: slot.bookingEvent.ownerId },
      select: {
        timeZone: true,
        miniappEnabled: true,
        bookingEnabled: true
      }
    });
    if (details.requireMiniappAvailability) {
      const owner = await tx.user.findUnique({
        where: { id: slot.bookingEvent.ownerId },
        select: { status: true }
      });
      if (
        owner?.status !== "active" ||
        !settings?.miniappEnabled ||
        !settings.bookingEnabled
      ) {
        return { ok: false, error: "closed" } as const;
      }
    }
    if (
      isNaiveDateTimePast(
        slot.startTime,
        settings?.timeZone ?? DEFAULT_TIME_ZONE
      )
    ) {
      return { ok: false, error: "slotUnavailable" } as const;
    }

    const confirmed = await tx.booking.count({
      where: { timeSlotId: slot.id, status: "confirmed" }
    });
    if (confirmed >= slot.capacity) return { ok: false, error: "slotFull" } as const;

    const booking = await tx.booking.create({
      data: {
        timeSlotId: slot.id,
        name: details.name,
        subject: details.subject,
        contactMethod: details.contactMethod,
        contactValue: details.contactValue,
        email: details.email,
        notes: details.notes,
        cancelToken: details.cancelToken,
        locale: details.locale,
        wechatIdentityId: details.wechatIdentityId
      }
    });
    return { ok: true, slot, booking } as const;
  });
}

/**
 * Atomically reserves several slots from the same booking event.
 *
 * Locks are acquired in a stable order so overlapping carts cannot deadlock.
 * Every capacity check and insert happens inside one transaction: when any
 * selected slot is unavailable, the visitor gets an error and no partial
 * booking is left behind.
 */
export async function reserveSlots(
  slotIds: string[],
  details: Omit<BookingDetails, "cancelToken" | "subject"> & {
    cancelTokens: string[];
    subjects: string[];
  }
): Promise<ReserveSlotsResult> {
  const uniqueSlotIds = Array.from(new Set(slotIds));
  if (
    uniqueSlotIds.length === 0 ||
    uniqueSlotIds.length !== slotIds.length ||
    details.cancelTokens.length !== slotIds.length ||
    details.subjects.length !== slotIds.length
  ) {
    return { ok: false, error: "slotUnavailable" };
  }

  const tokenBySlot = new Map(
    slotIds.map((slotId, index) => [slotId, details.cancelTokens[index]])
  );
  const subjectBySlot = new Map(
    slotIds.map((slotId, index) => [slotId, details.subjects[index]])
  );
  const orderedIds = [...uniqueSlotIds].sort();

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(
      Prisma.sql`
        SELECT id
        FROM "TimeSlot"
        WHERE id IN (${Prisma.join(orderedIds)})
        ORDER BY id
        FOR UPDATE
      `
    );

    const slots = await tx.timeSlot.findMany({
      where: { id: { in: orderedIds } },
      include: { bookingEvent: true }
    });
    if (slots.length !== orderedIds.length) {
      return { ok: false, error: "slotUnavailable" } as const;
    }

    const eventId = slots[0]?.bookingEventId;
    if (
      !eventId ||
      slots.some((slot) => slot.bookingEventId !== eventId)
    ) {
      return { ok: false, error: "slotUnavailable" } as const;
    }
    if (!slots[0].bookingEvent.open) {
      return { ok: false, error: "closed" } as const;
    }

    await tx.$queryRaw`
      SELECT id
      FROM "BookingEvent"
      WHERE id = ${eventId}
      FOR SHARE
    `;
    await tx.$queryRaw`
      SELECT id
      FROM "User"
      WHERE id = ${slots[0].bookingEvent.ownerId}
      FOR SHARE
    `;
    await tx.$queryRaw`
      SELECT id
      FROM "SiteSettings"
      WHERE "ownerId" = ${slots[0].bookingEvent.ownerId}
      FOR SHARE
    `;
    const [freshEvent, settings] = await Promise.all([
      tx.bookingEvent.findUnique({
        where: { id: eventId },
        select: { open: true }
      }),
      tx.siteSettings.findUnique({
        where: { ownerId: slots[0].bookingEvent.ownerId },
        select: {
          timeZone: true,
          miniappEnabled: true,
          bookingEnabled: true
        }
      })
    ]);
    const owner = await tx.user.findUnique({
      where: { id: slots[0].bookingEvent.ownerId },
      select: { status: true }
    });
    if (
      !freshEvent?.open ||
      !settings?.bookingEnabled ||
      owner?.status !== "active"
    ) {
      return { ok: false, error: "closed" } as const;
    }
    if (details.requireMiniappAvailability) {
      if (!settings.miniappEnabled) {
        return { ok: false, error: "closed" } as const;
      }
    }

    for (const slot of slots) {
      if (isNaiveDateTimePast(slot.startTime, settings.timeZone)) {
        return {
          ok: false,
          error: "slotUnavailable",
          slotId: slot.id
        } as const;
      }
      const confirmed = await tx.booking.count({
        where: { timeSlotId: slot.id, status: "confirmed" }
      });
      if (confirmed >= slot.capacity) {
        return { ok: false, error: "slotFull", slotId: slot.id } as const;
      }
    }

    const reservations: {
      slot: TimeSlot & { bookingEvent: BookingEvent };
      booking: Booking;
    }[] = [];
    for (const slotId of slotIds) {
      const slot = slots.find((candidate) => candidate.id === slotId);
      const cancelToken = tokenBySlot.get(slotId);
      const subject = subjectBySlot.get(slotId);
      if (!slot || !cancelToken || subject === undefined) {
        return { ok: false, error: "slotUnavailable" } as const;
      }
      const booking = await tx.booking.create({
        data: {
          timeSlotId: slot.id,
          name: details.name,
          subject,
          contactMethod: details.contactMethod,
          contactValue: details.contactValue,
          email: details.email,
          notes: details.notes,
          cancelToken,
          locale: details.locale,
          wechatIdentityId: details.wechatIdentityId
        }
      });
      reservations.push({ slot, booking });
    }

    return { ok: true, reservations } as const;
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
    select: {
      id: true,
      lotteryEnabled: true,
      lotteryDraw: { select: { id: true } }
    }
  });
  if (owned.length !== allIds.length) return { ok: false, error: "invalid" };

  // A LotteryDraw is unique per event, so only one draw can survive the merge.
  const withDraw = owned.filter((event) => event.lotteryDraw);
  if (withDraw.length > 1) return { ok: false, error: "lotteryConflict" };
  const drawToReassign =
    withDraw.length === 1 && withDraw[0].id !== targetId ? withDraw[0].id : null;
  const preserveLotteryEnabled =
    drawToReassign !== null && withDraw[0].lotteryEnabled;

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
      // The draw's event-level gate belongs to the feature being moved. Without
      // preserving it, choosing a non-lottery event as the merge target silently
      // makes the surviving public draw URL return 404.
      if (preserveLotteryEnabled) {
        await tx.bookingEvent.update({
          where: { id: targetId },
          data: { lotteryEnabled: true }
        });
      }
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
