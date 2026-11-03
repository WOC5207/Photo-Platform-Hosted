/**
 * Correctness tests for editing a slot after it was made (updateSlotForOwner
 * in src/lib/booking.ts). The edit can move a slot that visitors already hold,
 * so the risks are an overbooked slot, a booking silently detached from its
 * slot, a slot moved onto another owner's day, and an accidental overlap.
 * This seeds real rows, runs the edits, and asserts each guard.
 *
 * Run against a disposable database:
 *   npm run test:slot-edit
 *
 * Exits non-zero on failure. Cleans up the rows it creates.
 */
import { randomUUID } from "crypto";
import { PrismaClient } from "@prisma/client";
import { updateSlotForOwner, type SlotEditInput } from "../src/lib/booking";

const prisma = new PrismaClient();
let failures = 0;

function report(name: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}\n      ${detail}`);
  if (!ok) failures++;
}

const token = () => randomUUID().replace(/-/g, "");
const at = (day: number, hour: number, minute = 0) =>
  new Date(Date.UTC(2030, 4, day, hour, minute));

async function makeOwner(): Promise<string> {
  const user = await prisma.user.create({
    data: {
      username: `slotedit-${randomUUID().slice(0, 8)}`,
      passwordHash: "not-a-real-hash-this-account-cannot-log-in",
      role: "user"
    }
  });
  return user.id;
}

/** A two-day event: 10:00–10:30 (booked twice, 3 seats) and 11:00–11:30 on day 1. */
async function makeEvent(ownerId: string) {
  const event = await prisma.bookingEvent.create({
    data: {
      ownerId,
      token: token(),
      titleEn: "seed",
      titleZh: "seed",
      date: at(1, 0),
      open: true,
      days: { create: [{ date: at(1, 0) }, { date: at(2, 0) }] }
    },
    include: { days: { orderBy: { date: "asc" } } }
  });
  const [day1, day2] = event.days;
  const slot = (start: Date, end: Date, capacity: number) =>
    prisma.timeSlot.create({
      data: {
        bookingEventId: event.id,
        bookingDayId: day1.id,
        startTime: start,
        endTime: end,
        capacity,
        pricePerPerson: "CAD 50",
        descriptionEn: "Alex",
        descriptionZh: "Alex"
      }
    });
  const booked = await slot(at(1, 10), at(1, 10, 30), 3);
  const neighbour = await slot(at(1, 11), at(1, 11, 30), 1);
  for (const status of ["confirmed", "confirmed", "cancelled"]) {
    await prisma.booking.create({
      data: {
        timeSlotId: booked.id,
        name: `visitor-${status}`,
        cancelToken: token(),
        email: "visitor@example.com",
        status
      }
    });
  }
  return { event, day1, day2, booked, neighbour };
}

function input(
  base: { booked: { id: string }; day1: { id: string } },
  patch: Partial<SlotEditInput> = {}
): SlotEditInput {
  return {
    slotId: base.booked.id,
    bookingDayId: base.day1.id,
    startTime: "10:00",
    endTime: "10:30",
    capacity: 3,
    pricePerPerson: "CAD 50",
    descriptionEn: "Alex",
    descriptionZh: "Alex",
    allowOverlap: false,
    ...patch
  };
}

async function main() {
  const ownerId = await makeOwner();
  const otherOwnerId = await makeOwner();

  try {
    // 1. Moving a booked slot keeps its bookings and records the move.
    {
      const e = await makeEvent(ownerId);
      const result = await updateSlotForOwner(
        ownerId,
        input(e, { startTime: "09:00", endTime: "09:45", descriptionEn: "Sam" })
      );
      const slot = await prisma.timeSlot.findUnique({
        where: { id: e.booked.id },
        include: { bookings: true }
      });
      report(
        "move: a booked slot moves with its bookings, and the move is recorded",
        result.ok &&
          result.timeChanged &&
          result.confirmed.length === 2 &&
          result.previousStart.getTime() === at(1, 10).getTime() &&
          slot?.startTime.getTime() === at(1, 9).getTime() &&
          slot?.endTime.getTime() === at(1, 9, 45).getTime() &&
          slot?.descriptionEn === "Sam" &&
          slot?.bookings.length === 3 &&
          slot?.rescheduledAt instanceof Date,
        `ok=${result.ok} start=${slot?.startTime.toISOString()} bookings=${slot?.bookings.length} rescheduledAt=${slot?.rescheduledAt?.toISOString()}`
      );
    }

    // 2. Capacity cannot drop below the confirmed bookings.
    {
      const e = await makeEvent(ownerId);
      const result = await updateSlotForOwner(ownerId, input(e, { capacity: 1 }));
      const same = await updateSlotForOwner(ownerId, input(e, { capacity: 2 }));
      const slot = await prisma.timeSlot.findUnique({ where: { id: e.booked.id } });
      report(
        "capacity: below the two confirmed bookings is refused; equal to them is fine",
        !result.ok &&
          result.error === "belowBooked" &&
          result.booked === 2 &&
          same.ok &&
          slot?.capacity === 2,
        `below=${result.ok ? "ok (WRONG)" : result.error} equal=${same.ok} capacity=${slot?.capacity}`
      );
    }

    // 3. Overlaps need the photographer's go-ahead.
    {
      const e = await makeEvent(ownerId);
      const refused = await updateSlotForOwner(
        ownerId,
        input(e, { startTime: "10:45", endTime: "11:15" })
      );
      const untouched = await prisma.timeSlot.findUnique({ where: { id: e.booked.id } });
      const allowed = await updateSlotForOwner(
        ownerId,
        input(e, { startTime: "10:45", endTime: "11:15", allowOverlap: true })
      );
      const touching = await updateSlotForOwner(
        ownerId,
        input(e, { startTime: "10:30", endTime: "11:00" })
      );
      report(
        "overlap: refused with the slot in the way, saved when allowed, touching ends are fine",
        !refused.ok &&
          refused.error === "overlap" &&
          refused.overlaps.length === 1 &&
          refused.overlaps[0].start.getTime() === e.neighbour.startTime.getTime() &&
          untouched?.startTime.getTime() === at(1, 10).getTime() &&
          allowed.ok &&
          touching.ok,
        `refused=${refused.ok ? "ok (WRONG)" : refused.error} allowed=${allowed.ok} touching=${touching.ok}`
      );
    }

    // 4. A label-only edit of a slot that already overlaps is not blocked, and
    //    does not count as a move.
    {
      const e = await makeEvent(ownerId);
      await prisma.timeSlot.update({
        where: { id: e.booked.id },
        data: { startTime: at(1, 11), endTime: at(1, 11, 30) }
      });
      const result = await updateSlotForOwner(
        ownerId,
        input(e, { startTime: "11:00", endTime: "11:30", descriptionZh: "小林" })
      );
      const slot = await prisma.timeSlot.findUnique({ where: { id: e.booked.id } });
      report(
        "label edit: an existing parallel slot keeps saving, with no move recorded",
        result.ok && !result.timeChanged && slot?.descriptionZh === "小林" && slot?.rescheduledAt === null,
        `ok=${result.ok} timeChanged=${result.ok && result.timeChanged} rescheduledAt=${slot?.rescheduledAt}`
      );
    }

    // 5. Times must make a forward range inside the day; "00:00" ends at midnight.
    {
      const e = await makeEvent(ownerId);
      const backwards = await updateSlotForOwner(
        ownerId,
        input(e, { startTime: "10:00", endTime: "09:00" })
      );
      const empty = await updateSlotForOwner(
        ownerId,
        input(e, { startTime: "10:00", endTime: "10:00" })
      );
      const midnight = await updateSlotForOwner(
        ownerId,
        input(e, { startTime: "23:30", endTime: "00:00" })
      );
      const slot = await prisma.timeSlot.findUnique({ where: { id: e.booked.id } });
      report(
        "time: backwards and empty ranges are refused; an end of 00:00 means midnight",
        !backwards.ok &&
          backwards.error === "invalidTime" &&
          !empty.ok &&
          empty.error === "invalidTime" &&
          midnight.ok &&
          slot?.endTime.getTime() === at(2, 0).getTime(),
        `backwards=${backwards.ok ? "ok (WRONG)" : backwards.error} midnight=${midnight.ok} end=${slot?.endTime.toISOString()}`
      );
    }

    // 6. Moving to another day of the same event.
    {
      const e = await makeEvent(ownerId);
      const result = await updateSlotForOwner(
        ownerId,
        input(e, { bookingDayId: e.day2.id, startTime: "10:45", endTime: "11:15" })
      );
      const slot = await prisma.timeSlot.findUnique({
        where: { id: e.booked.id },
        include: { bookings: true }
      });
      report(
        "day: a slot moves to another day of its event (the old day's neighbour is no overlap)",
        result.ok &&
          result.timeChanged &&
          slot?.bookingDayId === e.day2.id &&
          slot?.startTime.getTime() === at(2, 10, 45).getTime() &&
          slot?.bookings.length === 3,
        `ok=${result.ok} day=${slot?.bookingDayId === e.day2.id ? "day2" : "other"} start=${slot?.startTime.toISOString()}`
      );
    }

    // 7. Ownership: no editing someone else's slot, no moving onto their day.
    {
      const mine = await makeEvent(ownerId);
      const theirs = await makeEvent(otherOwnerId);
      const foreignSlot = await updateSlotForOwner(ownerId, input(theirs, { capacity: 50 }));
      const foreignDay = await updateSlotForOwner(
        ownerId,
        input(mine, { bookingDayId: theirs.day1.id })
      );
      const theirSlot = await prisma.timeSlot.findUnique({ where: { id: theirs.booked.id } });
      const mySlot = await prisma.timeSlot.findUnique({ where: { id: mine.booked.id } });
      report(
        "ownership: another owner's slot and another event's day are both not found",
        !foreignSlot.ok &&
          foreignSlot.error === "notFound" &&
          !foreignDay.ok &&
          foreignDay.error === "notFound" &&
          theirSlot?.capacity === 3 &&
          mySlot?.bookingDayId === mine.day1.id,
        `slot=${foreignSlot.ok ? "ok (WRONG)" : foreignSlot.error} day=${foreignDay.ok ? "ok (WRONG)" : foreignDay.error}`
      );
    }

    // 8. With prices off the stored price is kept, not wiped.
    {
      const e = await makeEvent(ownerId);
      const kept = await updateSlotForOwner(ownerId, input(e, { pricePerPerson: null }));
      const keptSlot = await prisma.timeSlot.findUnique({ where: { id: e.booked.id } });
      const changed = await updateSlotForOwner(ownerId, input(e, { pricePerPerson: "¥200" }));
      const changedSlot = await prisma.timeSlot.findUnique({ where: { id: e.booked.id } });
      report(
        "price: null keeps the stored price; a value replaces it",
        kept.ok && keptSlot?.pricePerPerson === "CAD 50" && changed.ok && changedSlot?.pricePerPerson === "¥200",
        `kept=${keptSlot?.pricePerPerson} changed=${changedSlot?.pricePerPerson}`
      );
    }
  } finally {
    // Deleting the owners cascades every event/day/slot/booking created here.
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
