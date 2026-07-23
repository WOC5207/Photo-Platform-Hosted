/**
 * Correctness tests for merging and splitting booking events (mergeEvents /
 * splitEvent in src/lib/booking.ts). Both operations reparent days, slots and
 * bookings across events, so the risk is silent data loss or mis-parenting —
 * invisible to the typechecker. This seeds real rows, runs the operations, and
 * asserts every row lands where it should and the guards fire.
 *
 * Run against a disposable database:
 *   npm run test:bookingorg
 *
 * Exits non-zero on failure. Cleans up the rows it creates.
 */
import { randomUUID } from "crypto";
import { PrismaClient } from "@prisma/client";
import { mergeEvents, splitEvent } from "../src/lib/booking";

const prisma = new PrismaClient();
let failures = 0;

function report(name: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}\n      ${detail}`);
  if (!ok) failures++;
}

const token = () => randomUUID().replace(/-/g, "");
const dayAt = (day: number) => new Date(Date.UTC(2030, 0, day));

async function makeOwner(): Promise<string> {
  const user = await prisma.user.create({
    data: {
      username: `bookingorg-${randomUUID().slice(0, 8)}`,
      passwordHash: "not-a-real-hash-this-account-cannot-log-in",
      role: "user"
    }
  });
  return user.id;
}

interface SeedOptions {
  dates: Date[];
  bookingOnDayIndex?: number;
  withDraw?: boolean;
}

async function makeEvent(ownerId: string, opts: SeedOptions) {
  const event = await prisma.bookingEvent.create({
    data: {
      ownerId,
      token: token(),
      titleEn: "seed",
      titleZh: "seed",
      date: opts.dates[0],
      open: true,
      days: { create: opts.dates.map((date) => ({ date })) }
    },
    include: { days: { orderBy: { date: "asc" } } }
  });
  const slots = [];
  for (const day of event.days) {
    slots.push(
      await prisma.timeSlot.create({
        data: {
          bookingEventId: event.id,
          bookingDayId: day.id,
          startTime: day.date,
          endTime: new Date(day.date.getTime() + 3_600_000),
          capacity: 5
        }
      })
    );
  }
  let booking = null;
  if (opts.bookingOnDayIndex != null) {
    booking = await prisma.booking.create({
      data: {
        timeSlotId: slots[opts.bookingOnDayIndex].id,
        name: "visitor",
        cancelToken: token(),
        status: "confirmed"
      }
    });
  }
  let draw = null;
  if (opts.withDraw) {
    draw = await prisma.lotteryDraw.create({
      data: { bookingEventId: event.id, token: token() }
    });
  }
  return { event, days: event.days, slots, booking, draw };
}

async function main() {
  const ownerId = await makeOwner();
  const otherOwnerId = await makeOwner();

  try {
    // 1. Merge distinct-day events; bookings and their cancel links survive.
    {
      const a = await makeEvent(ownerId, { dates: [dayAt(10)], bookingOnDayIndex: 0 });
      const b = await makeEvent(ownerId, { dates: [dayAt(11)], bookingOnDayIndex: 0 });
      const result = await mergeEvents(ownerId, a.event.id, [b.event.id]);
      const target = await prisma.bookingEvent.findUnique({
        where: { id: a.event.id },
        include: { days: true, slots: { include: { bookings: true } } }
      });
      const sourceGone = !(await prisma.bookingEvent.findUnique({
        where: { id: b.event.id }
      }));
      const bookings = target?.slots.flatMap((s) => s.bookings) ?? [];
      const cancelTokensKept =
        bookings.some((x) => x.cancelToken === a.booking!.cancelToken) &&
        bookings.some((x) => x.cancelToken === b.booking!.cancelToken);
      report(
        "merge: distinct days, slots and bookings all move to the target",
        result.ok &&
          target?.days.length === 2 &&
          target?.slots.length === 2 &&
          bookings.length === 2 &&
          cancelTokensKept &&
          sourceGone &&
          target?.date.getTime() === dayAt(10).getTime(),
        `days=${target?.days.length} slots=${target?.slots.length} bookings=${bookings.length} sourceGone=${sourceGone}`
      );
    }

    // 2. Same-date days combine into one instead of clashing on the unique key.
    {
      const c = await makeEvent(ownerId, { dates: [dayAt(20)] });
      const d = await makeEvent(ownerId, { dates: [dayAt(20)] });
      const result = await mergeEvents(ownerId, c.event.id, [d.event.id]);
      const target = await prisma.bookingEvent.findUnique({
        where: { id: c.event.id },
        include: { days: true, slots: true }
      });
      report(
        "merge: two days on the same date combine into one day, keeping both slots",
        result.ok && target?.days.length === 1 && target?.slots.length === 2,
        `days=${target?.days.length} (want 1) slots=${target?.slots.length} (want 2)`
      );
    }

    // 3. Two prize draws can't merge (a draw is unique per event).
    {
      const e = await makeEvent(ownerId, { dates: [dayAt(30)], withDraw: true });
      const f = await makeEvent(ownerId, { dates: [dayAt(31)], withDraw: true });
      const result = await mergeEvents(ownerId, e.event.id, [f.event.id]);
      const bothExist =
        !!(await prisma.bookingEvent.findUnique({ where: { id: e.event.id } })) &&
        !!(await prisma.bookingEvent.findUnique({ where: { id: f.event.id } }));
      report(
        "merge: refuses when more than one event has a prize draw",
        !result.ok && result.error === "lotteryConflict" && bothExist,
        `error=${result.ok ? "ok (WRONG)" : result.error} bothExist=${bothExist}`
      );
    }

    // 4. A single draw on a source is reassigned to the target.
    {
      const g = await makeEvent(ownerId, { dates: [dayAt(40)] });
      const h = await makeEvent(ownerId, { dates: [dayAt(41)], withDraw: true });
      const result = await mergeEvents(ownerId, g.event.id, [h.event.id]);
      const draw = await prisma.lotteryDraw.findUnique({
        where: { bookingEventId: g.event.id }
      });
      report(
        "merge: a lone prize draw is reassigned to the surviving event",
        result.ok && !!draw && draw.id === h.draw!.id,
        `drawOnTarget=${!!draw} sameDraw=${draw?.id === h.draw?.id}`
      );
    }

    // 5. Split off a subset; the split-off day carries its booking to the new event.
    {
      const j = await makeEvent(ownerId, {
        dates: [dayAt(60), dayAt(61)],
        bookingOnDayIndex: 0
      });
      const splitDayId = j.days[0].id; // the day holding the booking
      const result = await splitEvent(ownerId, j.event.id, [splitDayId]);
      const newEventId = result.ok ? result.newEventId : "";
      const created = await prisma.bookingEvent.findUnique({
        where: { id: newEventId },
        include: { days: true, slots: { include: { bookings: true } } }
      });
      const original = await prisma.bookingEvent.findUnique({
        where: { id: j.event.id },
        include: { days: true }
      });
      const movedBooking = created?.slots.flatMap((s) => s.bookings) ?? [];
      report(
        "split: selected day (with its booking) moves to a new event, rest stays",
        result.ok &&
          created?.days.length === 1 &&
          created?.days[0].id === splitDayId &&
          movedBooking.some((x) => x.cancelToken === j.booking!.cancelToken) &&
          original?.days.length === 1 &&
          created?.token !== j.event.token,
        `newDays=${created?.days.length} newBookings=${movedBooking.length} originalDays=${original?.days.length}`
      );
    }

    // 6. Split must leave at least one day and move at least one.
    {
      const k = await makeEvent(ownerId, { dates: [dayAt(70), dayAt(71)] });
      const all = k.days.map((day) => day.id);
      const splitAll = await splitEvent(ownerId, k.event.id, all);
      const splitNone = await splitEvent(ownerId, k.event.id, []);
      report(
        "split: rejects splitting off every day or none",
        !splitAll.ok &&
          splitAll.error === "invalid" &&
          !splitNone.ok &&
          splitNone.error === "invalid",
        `all=${splitAll.ok ? "ok (WRONG)" : splitAll.error} none=${splitNone.ok ? "ok (WRONG)" : splitNone.error}`
      );
    }

    // 7. Splitting off a day whose booking is a lottery entrant is refused.
    {
      const l = await makeEvent(ownerId, {
        dates: [dayAt(80), dayAt(81)],
        bookingOnDayIndex: 0,
        withDraw: true
      });
      await prisma.lotteryEntry.create({
        data: {
          drawId: l.draw!.id,
          bookingId: l.booking!.id,
          name: "visitor",
          token: token()
        }
      });
      const result = await splitEvent(ownerId, l.event.id, [l.days[0].id]);
      const stillTwo = await prisma.bookingDay.count({
        where: { bookingEventId: l.event.id }
      });
      report(
        "split: refuses to move a booking that is entered in the prize draw",
        !result.ok && result.error === "lotterySplit" && stillTwo === 2,
        `error=${result.ok ? "ok (WRONG)" : result.error} daysLeft=${stillTwo}`
      );
    }

    // 8. Ownership: a foreign event id can neither be a target nor a source.
    {
      const mine = await makeEvent(ownerId, { dates: [dayAt(90)] });
      const foreign = await makeEvent(otherOwnerId, { dates: [dayAt(91)] });
      const asSource = await mergeEvents(ownerId, mine.event.id, [foreign.event.id]);
      const foreignSplit = await splitEvent(ownerId, foreign.event.id, [
        foreign.days[0].id
      ]);
      const foreignIntact = !!(await prisma.bookingEvent.findUnique({
        where: { id: foreign.event.id }
      }));
      report(
        "ownership: a foreign event cannot be merged in or split by another user",
        !asSource.ok &&
          asSource.error === "invalid" &&
          !foreignSplit.ok &&
          foreignSplit.error === "invalid" &&
          foreignIntact,
        `merge=${asSource.ok ? "ok (WRONG)" : asSource.error} split=${foreignSplit.ok ? "ok (WRONG)" : foreignSplit.error}`
      );
    }
  } finally {
    // Deleting the owners cascades every event/day/slot/booking/draw created here.
    await prisma.user
      .deleteMany({ where: { id: { in: [ownerId, otherOwnerId] } } })
      .catch(() => undefined);
    await prisma.$disconnect();
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) FAILED.`);
    process.exit(1);
  }
  console.log("\nAll checks passed.");
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
