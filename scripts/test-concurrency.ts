/**
 * Concurrency tests for the two invariants that used to ride on SQLite's
 * serialized writes (connection_limit=1) and now need explicit row locks on
 * Postgres. Both failure modes are silent and only appear under real
 * simultaneous load, so they are invisible to manual testing — hence this.
 *
 * Run against a disposable database:
 *   npm run test:concurrency
 *
 * Exits non-zero on failure. Cleans up the rows it creates.
 *
 * On test design: the "stampede" tests below (fire N calls via Promise.all)
 * are NOT sufficient on their own. Node issues each transaction's BEGIN
 * sequentially, which staggers their start times ~1ms apart; a transaction
 * that finishes faster than the stagger never overlaps its peers and so never
 * races, and the test passes whether or not the lock is there. That is
 * exactly what happened to the booking stampede before the deterministic test
 * below was added — it passed with the lock removed. Stampedes only catch
 * anything when the critical section is slow enough to overlap (the lottery's
 * per-prize count queries make it so). The deterministic tests, which hold a
 * lock from outside and assert the code under test blocks on it, are the ones
 * that actually prove the invariant; the stampedes are kept as smoke tests.
 */
import { randomUUID } from "crypto";
import { PrismaClient } from "@prisma/client";
import {
  addSlotBatchForOwner,
  reserveSlot,
  reserveSlots,
  updateVisitorBookingReservation
} from "../src/lib/booking";
import {
  deleteLotteryPrizeForOwner,
  spinForEntry
} from "../src/lib/lottery";
import { completeOwnerSetup } from "../src/lib/setup";
import { wallClockNow } from "../src/lib/timeZone";

const prisma = new PrismaClient();

const CONCURRENCY = 20;
let failures = 0;

/**
 * Booking events need an owner now. The races under test are per-slot and
 * per-draw, so one throwaway owner is enough — cleaned up at the end along with
 * everything hanging off it.
 */
let ownerId: string;

async function createOwner() {
  const user = await prisma.user.create({
    data: {
      username: `concurrency-test-${randomUUID().slice(0, 8)}`,
      passwordHash: "not-a-real-hash-this-account-cannot-log-in",
      role: "user",
      settings: { create: { bookingEnabled: true } }
    }
  });
  ownerId = user.id;
}

function report(name: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}\n      ${detail}`);
  if (!ok) failures++;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fires fn() CONCURRENCY times as simultaneously as the event loop allows. */
async function stampede<T>(fn: (i: number) => Promise<T>): Promise<T[]> {
  return Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => fn(i)));
}

function booking(i: number) {
  return {
    name: `racer-${i}`,
    subject: "",
    contactMethod: "email",
    contactValue: `racer-${i}@example.com`,
    email: "",
    notes: "",
    cancelToken: randomUUID().replace(/-/g, ""),
    locale: "zh"
  };
}

async function makeSlot(capacity: number) {
  const date = new Date();
  const event = await prisma.bookingEvent.create({
    data: {
      ownerId,
      token: randomUUID().replace(/-/g, ""),
      titleEn: "concurrency test",
      titleZh: "concurrency test",
      date,
      open: true,
      days: { create: { date } }
    },
    include: { days: true }
  });
  const slot = await prisma.timeSlot.create({
    data: {
      bookingEventId: event.id,
      bookingDayId: event.days[0].id,
      startTime: new Date(Date.now() + 60_000),
      endTime: new Date(Date.now() + 3600_000),
      capacity
    }
  });
  return { eventId: event.id, slotId: slot.id };
}

/**
 * The real proof for booking. Holds an exclusive row lock on the slot from a
 * separate transaction that fills the last spot, then calls reserveSlot and
 * asserts it *blocks* rather than reading stale state. If the FOR UPDATE is
 * missing, reserveSlot sails past the lock, counts zero confirmed bookings
 * (the holder hasn't committed), and overbooks — which this catches
 * deterministically, with no dependence on timing luck.
 */
async function testBookingLockIsHonoured() {
  const { eventId, slotId } = await makeSlot(1);

  let releaseHolder!: () => void;
  const holderMayCommit = new Promise<void>((r) => (releaseHolder = r));

  const holder = prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "TimeSlot" WHERE id = ${slotId} FOR UPDATE`;
      await tx.booking.create({ data: { timeSlotId: slotId, ...booking(999) } });
      await holderMayCommit; // keep the lock open
    },
    { timeout: 15_000 }
  );

  await sleep(300); // let the holder take the lock

  let settled = false;
  const contender = reserveSlot(slotId, booking(0)).then((r) => {
    settled = true;
    return r;
  });

  await sleep(700);
  const blockedWhileLocked = !settled;

  releaseHolder();
  await holder;
  const result = await contender;

  report(
    "booking: reserveSlot blocks on a held slot lock, then sees it is full",
    blockedWhileLocked && !result.ok && result.error === "slotFull",
    blockedWhileLocked
      ? `blocked as expected, then returned ${result.ok ? "ok (WRONG — overbooked)" : result.error}`
      : "returned while the slot was locked — the FOR UPDATE is missing, so this would overbook"
  );

  await prisma.bookingEvent.delete({ where: { id: eventId } });
}

/** Smoke test: see the file header for why this alone proves little. */
async function testBookingStampede() {
  const { eventId, slotId } = await makeSlot(1);

  const results = await stampede((i) => reserveSlot(slotId, booking(i)));
  const accepted = results.filter((r) => r.ok).length;
  const confirmed = await prisma.booking.count({
    where: { timeSlotId: slotId, status: "confirmed" }
  });

  report(
    "booking: capacity 1 survives 20 concurrent attempts (smoke)",
    accepted === 1 && confirmed === 1,
    `${accepted} accepted, ${confirmed} rows persisted (both must be 1)`
  );

  await prisma.bookingEvent.delete({ where: { id: eventId } });
}

async function makeDraw() {
  const event = await prisma.bookingEvent.create({
    data: {
      ownerId,
      token: randomUUID().replace(/-/g, ""),
      titleEn: "lottery concurrency test",
      titleZh: "lottery concurrency test",
      date: new Date(),
      open: true
    }
  });
  const draw = await prisma.lotteryDraw.create({
    data: { bookingEventId: event.id, token: randomUUID().replace(/-/g, ""), open: true }
  });
  return { eventId: event.id, drawId: draw.id };
}

function entryData(drawId: string, i: number) {
  return {
    drawId,
    name: `spinner-${i}`,
    subject: "",
    contactMethod: "email",
    contactValue: `spinner-${i}@example.com`,
    token: `T${String(i).padStart(4, "0")}`
  };
}

/** Deterministic counterpart for the lottery: same lock-is-honoured proof. */
async function testLotteryLockIsHonoured() {
  const { eventId, drawId } = await makeDraw();
  await prisma.lotteryPrize.create({
    data: { drawId, name: "the only prize", quantity: 1, weight: 1 }
  });
  const entry = await prisma.lotteryEntry.create({ data: entryData(drawId, 0) });

  let releaseHolder!: () => void;
  const holderMayCommit = new Promise<void>((r) => (releaseHolder = r));

  const holder = prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "LotteryDraw" WHERE id = ${drawId} FOR UPDATE`;
      await holderMayCommit;
    },
    { timeout: 15_000 }
  );

  await sleep(300);

  let settled = false;
  const contender = spinForEntry(entry.id, drawId).then((r) => {
    settled = true;
    return r;
  });

  await sleep(700);
  const blockedWhileLocked = !settled;

  releaseHolder();
  await holder;
  await contender;

  report(
    "lottery: spinForEntry blocks on a held draw lock",
    blockedWhileLocked,
    blockedWhileLocked
      ? "blocked as expected"
      : "returned while the draw was locked — the FOR UPDATE is missing, so stock can be over-awarded"
  );

  await prisma.bookingEvent.delete({ where: { id: eventId } });
}

async function testBatchBookingIsAtomic() {
  const { eventId, slotId: firstSlotId } = await makeSlot(1);
  const firstSlot = await prisma.timeSlot.findUniqueOrThrow({
    where: { id: firstSlotId }
  });
  const secondSlot = await prisma.timeSlot.create({
    data: {
      bookingEventId: eventId,
      bookingDayId: firstSlot.bookingDayId,
      startTime: new Date(firstSlot.startTime.getTime() + 3_600_000),
      endTime: new Date(firstSlot.endTime.getTime() + 3_600_000),
      capacity: 1
    }
  });
  await reserveSlot(secondSlot.id, booking(90));

  const result = await reserveSlots([firstSlotId, secondSlot.id], {
    ...booking(91),
    cancelTokens: [
      randomUUID().replace(/-/g, ""),
      randomUUID().replace(/-/g, "")
    ]
  });
  const [firstCount, secondCount] = await Promise.all([
    prisma.booking.count({ where: { timeSlotId: firstSlotId } }),
    prisma.booking.count({ where: { timeSlotId: secondSlot.id } })
  ]);

  report(
    "booking cart: one full slot rolls the entire batch back",
    !result.ok &&
      result.error === "slotFull" &&
      result.slotId === secondSlot.id &&
      firstCount === 0 &&
      secondCount === 1,
    `result=${result.ok ? "ok" : `${result.error}:${result.slotId ?? "unknown"}`} counts=${firstCount}/${secondCount}`
  );

  const duplicate = await reserveSlots([firstSlotId, firstSlotId], {
    ...booking(92),
    cancelTokens: [
      randomUUID().replace(/-/g, ""),
      randomUUID().replace(/-/g, "")
    ]
  });
  report(
    "booking cart: duplicate slot ids are rejected before inserting",
    !duplicate.ok &&
      duplicate.error === "slotUnavailable" &&
      (await prisma.booking.count({ where: { timeSlotId: firstSlotId } })) === 0,
    duplicate.ok ? "duplicate batch was accepted" : `returned ${duplicate.error}`
  );

  await prisma.bookingEvent.delete({ where: { id: eventId } });
}

async function testExpiredSlotIsRejectedInOwnerTimeZone() {
  const timeZone = "America/Toronto";
  await prisma.siteSettings.upsert({
    where: { ownerId },
    create: { ownerId, timeZone },
    update: { timeZone }
  });
  const now = wallClockNow(timeZone);
  const event = await prisma.bookingEvent.create({
    data: {
      ownerId,
      token: randomUUID().replace(/-/g, ""),
      titleEn: "expired slot test",
      titleZh: "expired slot test",
      date: now,
      open: true,
      days: { create: { date: now } }
    },
    include: { days: true }
  });
  const slot = await prisma.timeSlot.create({
    data: {
      bookingEventId: event.id,
      bookingDayId: event.days[0].id,
      startTime: new Date(now.getTime() - 3_600_000),
      endTime: new Date(now.getTime() - 60_000),
      capacity: 1
    }
  });

  const result = await reserveSlot(slot.id, booking(0));
  const persisted = await prisma.booking.count({
    where: { timeSlotId: slot.id }
  });
  report(
    "booking: a started wall-clock slot is rejected in the owner's time zone",
    !result.ok && result.error === "slotUnavailable" && persisted === 0,
    `result=${result.ok ? "ok" : result.error} persisted=${persisted}`
  );

  await prisma.bookingEvent.delete({ where: { id: event.id } });
  await prisma.siteSettings.update({
    where: { ownerId },
    data: { timeZone: "UTC" }
  });
}

async function testVisitorBookingEditWindow() {
  await prisma.siteSettings.update({
    where: { ownerId },
    data: { bookingEnabled: true, timeZone: "UTC" }
  });
  const date = new Date("2035-04-12T00:00:00Z");
  const event = await prisma.bookingEvent.create({
    data: {
      ownerId,
      token: randomUUID().replace(/-/g, ""),
      titleEn: "visitor edit test",
      titleZh: "visitor edit test",
      date,
      open: true,
      visitorEditsEnabled: true,
      visitorEditCutoffHours: 24,
      days: { create: { date } }
    },
    include: { days: true }
  });
  const [slotA, slotB] = await Promise.all([
    prisma.timeSlot.create({
      data: {
        bookingEventId: event.id,
        bookingDayId: event.days[0].id,
        startTime: new Date("2035-04-12T12:00:00Z"),
        endTime: new Date("2035-04-12T12:30:00Z"),
        capacity: 1
      }
    }),
    prisma.timeSlot.create({
      data: {
        bookingEventId: event.id,
        bookingDayId: event.days[0].id,
        startTime: new Date("2035-04-12T13:00:00Z"),
        endTime: new Date("2035-04-12T13:30:00Z"),
        capacity: 1
      }
    })
  ]);
  const original = booking(120);
  const reserved = await reserveSlot(slotA.id, original);
  if (!reserved.ok) throw new Error("visitor edit test could not seed booking");

  const moved = await updateVisitorBookingReservation(
    original.cancelToken,
    {
      targetSlotId: slotB.id,
      name: "Updated visitor",
      subject: "Updated subject",
      contactValue: "updated@example.com",
      email: "updated@example.com",
      notes: "Updated notes"
    },
    new Date("2035-04-10T10:00:00Z")
  );
  const afterMove = await prisma.booking.findUnique({
    where: { cancelToken: original.cancelToken }
  });
  report(
    "booking edit: moves the booking and details atomically before cutoff",
    moved.ok &&
      afterMove?.timeSlotId === slotB.id &&
      afterMove.name === "Updated visitor" &&
      afterMove.subject === "Updated subject",
    `result=${moved.ok ? "ok" : moved.error}, slot=${afterMove?.timeSlotId}`
  );

  await reserveSlot(slotA.id, booking(121));
  const fullMove = await updateVisitorBookingReservation(
    original.cancelToken,
    {
      targetSlotId: slotA.id,
      name: "Should not save",
      subject: "",
      contactValue: "updated@example.com",
      email: "",
      notes: ""
    },
    new Date("2035-04-10T10:00:00Z")
  );
  const afterFullMove = await prisma.booking.findUnique({
    where: { cancelToken: original.cancelToken }
  });
  report(
    "booking edit: a full target leaves time and details unchanged",
    !fullMove.ok &&
      fullMove.error === "slotFull" &&
      afterFullMove?.timeSlotId === slotB.id &&
      afterFullMove.name === "Updated visitor",
    `result=${fullMove.ok ? "ok" : fullMove.error}, slot=${afterFullMove?.timeSlotId}`
  );

  const atCutoff = await updateVisitorBookingReservation(
    original.cancelToken,
    {
      targetSlotId: slotB.id,
      name: "Too late",
      subject: "",
      contactValue: "updated@example.com",
      email: "",
      notes: ""
    },
    new Date("2035-04-11T13:00:00Z")
  );
  report(
    "booking edit: the exact cutoff boundary is closed",
    !atCutoff.ok && atCutoff.error === "cutoff",
    `result=${atCutoff.ok ? "ok" : atCutoff.error}`
  );

  await prisma.bookingEvent.delete({ where: { id: event.id } });
}

async function testNewEventSlotBatchSync() {
  const event = await prisma.bookingEvent.create({
    data: {
      ownerId,
      token: randomUUID().replace(/-/g, ""),
      titleEn: "slot sync test",
      titleZh: "slot sync test",
      date: new Date("2030-08-01T00:00:00Z"),
      open: false,
      days: {
        create: [
          { date: new Date("2030-08-01T00:00:00Z") },
          { date: new Date("2030-08-02T00:00:00Z") }
        ]
      }
    },
    include: { days: { orderBy: { date: "asc" } } }
  });
  const input = {
    bookingDayId: event.days[0].id,
    startTime: "10:00",
    slotMinutes: 30,
    slotCount: 2,
    capacity: 3,
    pricePerPerson: "CAD 50",
    descriptionEn: "Studio A",
    descriptionZh: "Studio A",
    syncAcrossDays: true
  };

  const added = await addSlotBatchForOwner(ownerId, input);
  const duplicate = await addSlotBatchForOwner(ownerId, input);
  const fresh = await prisma.bookingEvent.findUnique({
    where: { id: event.id },
    include: { slots: { orderBy: { startTime: "asc" } } }
  });
  const dates = new Set(
    fresh?.slots.map((slot) => slot.startTime.toISOString().slice(0, 10))
  );
  report(
    "booking setup: first slot batch syncs to every day once with display price",
    added &&
      !duplicate &&
      fresh?.slotsInitialized === true &&
      fresh.slots.length === 4 &&
      fresh.slots.every(
        (slot) =>
          slot.capacity === 3 &&
          slot.pricePerPerson === "CAD 50" &&
          slot.descriptionEn === "Studio A"
      ) &&
      dates.size === 2,
    `added=${added} duplicate=${duplicate} slots=${fresh?.slots.length ?? 0} dates=${dates.size}`
  );

  await prisma.bookingEvent.delete({ where: { id: event.id } });
}

async function testLotteryPrizeDeleteLockIsHonoured() {
  const { eventId, drawId } = await makeDraw();
  const prize = await prisma.lotteryPrize.create({
    data: { drawId, name: "prize being removed", quantity: 1, weight: 1 }
  });
  const winner = await prisma.lotteryEntry.create({
    data: {
      ...entryData(drawId, 0),
      wonPrizeId: prize.id,
      wonAt: new Date()
    }
  });

  let releaseHolder!: () => void;
  const holderMayCommit = new Promise<void>((r) => (releaseHolder = r));
  const holder = prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "LotteryDraw" WHERE id = ${drawId} FOR UPDATE`;
      await holderMayCommit;
    },
    { timeout: 15_000 }
  );

  await sleep(300);

  let settled = false;
  const contender = deleteLotteryPrizeForOwner(prize.id, ownerId).then((result) => {
    settled = true;
    return result;
  });

  await sleep(700);
  const blockedWhileLocked = !settled;

  releaseHolder();
  await holder;
  const deleted = await contender;
  const [freshPrize, freshWinner] = await Promise.all([
    prisma.lotteryPrize.findUnique({ where: { id: prize.id } }),
    prisma.lotteryEntry.findUnique({ where: { id: winner.id } })
  ]);

  report(
    "lottery: deleting a prize uses the draw lock and atomically releases winners",
    blockedWhileLocked &&
      deleted &&
      freshPrize === null &&
      freshWinner?.wonPrizeId === null &&
      freshWinner.wonAt === null,
    blockedWhileLocked
      ? `blocked as expected; prize ${freshPrize ? "remains (WRONG)" : "deleted"} and winner ${
          freshWinner?.wonPrizeId ? "still holds it (WRONG)" : "was released"
        }`
      : "returned while the draw was locked — deletion can race a spin"
  );

  await prisma.bookingEvent.delete({ where: { id: eventId } });
}

async function testLotteryPrizeStock() {
  const { eventId, drawId } = await makeDraw();
  const prize = await prisma.lotteryPrize.create({
    data: { drawId, name: "the only prize", quantity: 1, weight: 1 }
  });

  // One entry per spinner: distinct entries contending for one unit of stock.
  const entries = await Promise.all(
    Array.from({ length: CONCURRENCY }, (_, i) =>
      prisma.lotteryEntry.create({ data: entryData(drawId, i) })
    )
  );

  const results = await stampede((i) => spinForEntry(entries[i].id, drawId));
  const won = results.filter((r) => r.ok).length;
  const awarded = await prisma.lotteryEntry.count({ where: { wonPrizeId: prize.id } });

  report(
    "lottery: prize quantity 1 under 20 concurrent spins",
    won === 1 && awarded === 1,
    `${won} spins won, ${awarded} rows hold the prize (both must be 1)`
  );

  // Same entry spun repeatedly: must award at most once.
  await prisma.lotteryPrize.create({
    data: { drawId, name: "second prize", quantity: 10, weight: 1 }
  });
  const entry = await prisma.lotteryEntry.create({
    data: { ...entryData(drawId, 0), token: "DBLCK", name: "double-clicker" }
  });
  const dupes = await stampede(() => spinForEntry(entry.id, drawId));
  const dupeWins = dupes.filter((r) => r.ok).length;
  const fresh = await prisma.lotteryEntry.findUnique({ where: { id: entry.id } });

  report(
    "lottery: same entry spun 20x concurrently awards once",
    dupeWins === 1 && fresh?.wonPrizeId != null,
    `${dupeWins} spins reported a win (must be 1), entry holds ${fresh?.wonPrizeId ?? "nothing"}`
  );

  await prisma.bookingEvent.delete({ where: { id: eventId } });
}

async function testSetupCompletionIsIdempotent() {
  const setupOwner = await prisma.user.create({
    data: {
      username: `setup-concurrency-${randomUUID().slice(0, 8)}`,
      passwordHash: "not-a-real-hash-this-account-cannot-log-in",
      role: "user",
      settings: { create: {} }
    }
  });

  const attempts = await Promise.all(
    Array.from({ length: 8 }, () => completeOwnerSetup(setupOwner.id))
  );
  const [settings, albums, bookingEvents, repeated] = await Promise.all([
    prisma.siteSettings.findUnique({ where: { ownerId: setupOwner.id } }),
    prisma.event.findMany({
      where: { ownerId: setupOwner.id, titleEn: "My First Album" }
    }),
    prisma.bookingEvent.findMany({
      where: { ownerId: setupOwner.id, titleEn: "Sample Photoshoot" },
      include: { days: true }
    }),
    completeOwnerSetup(setupOwner.id)
  ]);

  const completedAttempts = attempts.filter(Boolean).length;
  report(
    "setup: concurrent completion creates one atomic seed set",
    completedAttempts === 1 &&
      repeated === false &&
      settings?.setupCompleted === true &&
      albums.length === 1 &&
      bookingEvents.length === 1 &&
      bookingEvents[0].days.length === 1,
    `${completedAttempts} attempt(s) seeded; ${albums.length} album(s), ${
      bookingEvents.length
    } booking event(s), ${
      bookingEvents.reduce((sum, event) => sum + event.days.length, 0)
    } booking day(s)`
  );

  await prisma.user.delete({ where: { id: setupOwner.id } });
}

async function main() {
  console.log(`Running with ${CONCURRENCY}x concurrency\n`);
  await createOwner();
  await testBookingLockIsHonoured();
  await testBookingStampede();
  await testBatchBookingIsAtomic();
  await testExpiredSlotIsRejectedInOwnerTimeZone();
  await testVisitorBookingEditWindow();
  await testNewEventSlotBatchSync();
  await testLotteryLockIsHonoured();
  await testLotteryPrizeDeleteLockIsHonoured();
  await testLotteryPrizeStock();
  await testSetupCompletionIsIdempotent();
  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}`);
  // Cascades to anything the tests left behind.
  await prisma.user.delete({ where: { id: ownerId } });
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
