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
import { reserveSlot } from "../src/lib/booking";
import { spinForEntry } from "../src/lib/lottery";

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
      role: "user"
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
      startTime: new Date(),
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

async function main() {
  console.log(`Running with ${CONCURRENCY}x concurrency\n`);
  await createOwner();
  await testBookingLockIsHonoured();
  await testBookingStampede();
  await testLotteryLockIsHonoured();
  await testLotteryPrizeStock();
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
