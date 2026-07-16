/**
 * Cross-tenant isolation tests.
 *
 * The threat: every server action takes its ids straight from the form body,
 * and authentication only proves *someone* is signed in — not that the row
 * belongs to them. So this builds two owners, Alice and Bob, and calls the
 * ownership helpers the actions use with the *other* owner's ids, asserting
 * each one refuses.
 *
 * These bugs fail open and silently: nothing errors, the wrong row just
 * changes. That is why this exists rather than relying on the typechecker,
 * which is perfectly happy with findUnique({ where: { id } }).
 *
 * Run against a disposable database:
 *   npm run test:isolation
 */
import { randomUUID } from "crypto";
import { PrismaClient, type User } from "@prisma/client";
import {
  filterOwnedPhotoIds,
  findOwnedBooking,
  findOwnedBookingEvent,
  findOwnedDraw,
  findOwnedEntry,
  findOwnedEvent,
  findOwnedPhoto,
  findOwnedPrize,
  findOwnedSlot
} from "../src/lib/ownership";
import { uniqueEventSlug } from "../src/lib/slug";
import { syncCreditProfiles } from "../src/lib/photoCredits";
import { getSiteSettings } from "../src/lib/settings";

const prisma = new PrismaClient();
let failures = 0;

function report(name: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}\n      ${detail}`);
  if (!ok) failures++;
}

async function makeUser(name: string): Promise<User> {
  return prisma.user.create({
    data: {
      username: `${name}-${randomUUID().slice(0, 8)}`,
      passwordHash: "not-a-real-hash",
      role: "user"
    }
  });
}

/** A full set of content owned by one user. */
async function seed(owner: User) {
  const event = await prisma.event.create({
    data: { ownerId: owner.id, slug: "shared-slug", titleEn: "A", titleZh: "A" }
  });
  const photo = await prisma.photo.create({
    data: {
      eventId: event.id,
      filename: randomUUID().replace(/-/g, ""),
      originalName: "x.jpg",
      width: 1,
      height: 1
    }
  });
  const bookingEvent = await prisma.bookingEvent.create({
    data: {
      ownerId: owner.id,
      token: randomUUID().replace(/-/g, ""),
      titleEn: "B",
      titleZh: "B",
      date: new Date()
    }
  });
  const slot = await prisma.timeSlot.create({
    data: {
      bookingEventId: bookingEvent.id,
      startTime: new Date(),
      endTime: new Date(Date.now() + 3600_000),
      capacity: 5
    }
  });
  const booking = await prisma.booking.create({
    data: {
      timeSlotId: slot.id,
      name: "visitor",
      subject: "",
      contactMethod: "email",
      contactValue: "v@example.com",
      notes: "",
      cancelToken: randomUUID().replace(/-/g, "")
    }
  });
  const draw = await prisma.lotteryDraw.create({
    data: { bookingEventId: bookingEvent.id, token: randomUUID().replace(/-/g, "") }
  });
  const prize = await prisma.lotteryPrize.create({
    data: { drawId: draw.id, name: "p", quantity: 1, weight: 1 }
  });
  const entry = await prisma.lotteryEntry.create({
    data: { drawId: draw.id, name: "e", subject: "", token: "AAAAA" }
  });
  await prisma.creditProfile.create({
    data: { ownerId: owner.id, creditName: "Jane" }
  });
  return { event, photo, bookingEvent, slot, booking, draw, prize, entry };
}

async function main() {
  const alice = await makeUser("alice");
  const bob = await makeUser("bob");
  const a = await seed(alice);

  // Every ownership helper, handed Alice's id while acting as Bob.
  const probes: [string, () => Promise<unknown>][] = [
    ["findOwnedEvent", () => findOwnedEvent(a.event.id, bob)],
    ["findOwnedPhoto", () => findOwnedPhoto(a.photo.id, bob)],
    ["findOwnedBookingEvent", () => findOwnedBookingEvent(a.bookingEvent.id, bob)],
    ["findOwnedSlot", () => findOwnedSlot(a.slot.id, bob)],
    ["findOwnedBooking", () => findOwnedBooking(a.booking.id, bob)],
    ["findOwnedDraw", () => findOwnedDraw(a.draw.id, bob)],
    ["findOwnedPrize", () => findOwnedPrize(a.prize.id, bob)],
    ["findOwnedEntry", () => findOwnedEntry(a.entry.id, bob)]
  ];
  for (const [name, run] of probes) {
    const got = await run();
    report(
      `${name}: refuses another owner's row`,
      got === null,
      got === null ? "returned null" : "RETURNED THE ROW — cross-tenant access"
    );
  }

  // ...and the same helpers must still find the owner's own rows, or the
  // guards are just broken rather than safe.
  const own = await findOwnedEvent(a.event.id, alice);
  report(
    "findOwnedEvent: still finds the owner's own row",
    own !== null,
    own !== null ? "found it" : "REFUSED THE OWNER — guard is broken, not safe"
  );

  // The bulk actions take an arbitrary id array from the client.
  const bobPhotoIds = await filterOwnedPhotoIds([a.photo.id], bob);
  report(
    "filterOwnedPhotoIds: drops another owner's photo ids",
    bobPhotoIds.length === 0,
    bobPhotoIds.length === 0
      ? "filtered to []"
      : `KEPT ${bobPhotoIds.length} — bulk delete would erase them and their files`
  );
  const alicePhotoIds = await filterOwnedPhotoIds([a.photo.id], alice);
  report(
    "filterOwnedPhotoIds: keeps the owner's own photo ids",
    alicePhotoIds.length === 1,
    `kept ${alicePhotoIds.length} of 1`
  );

  // Slugs are unique per owner: Bob must get the same slug, not "shared-slug-2".
  const bobSlug = await uniqueEventSlug(bob.id, "shared-slug");
  report(
    "uniqueEventSlug: scoped per owner",
    bobSlug === "shared-slug",
    bobSlug === "shared-slug"
      ? "Bob got 'shared-slug' despite Alice having it"
      : `Bob got '${bobSlug}' — another owner's albums are shaping his URLs`
  );
  const aliceSlug = await uniqueEventSlug(alice.id, "shared-slug");
  report(
    "uniqueEventSlug: still de-duplicates within one owner",
    aliceSlug === "shared-slug-2",
    `Alice got '${aliceSlug}' (want 'shared-slug-2')`
  );

  // Credit profiles are a private address book keyed per owner.
  await syncCreditProfiles(bob.id, [
    { creditName: "Jane", subject: "", socialLinks: [{ platform: "IG", url: "https://x" }] }
  ]);
  const aliceJane = await prisma.creditProfile.findUnique({
    where: { ownerId_creditName: { ownerId: alice.id, creditName: "Jane" } },
    include: { socialLinks: true }
  });
  const bobJane = await prisma.creditProfile.findUnique({
    where: { ownerId_creditName: { ownerId: bob.id, creditName: "Jane" } },
    include: { socialLinks: true }
  });
  report(
    "syncCreditProfiles: same name, separate profiles per owner",
    aliceJane?.socialLinks.length === 0 && bobJane?.socialLinks.length === 1,
    `Alice's Jane has ${aliceJane?.socialLinks.length} link(s), Bob's has ${bobJane?.socialLinks.length} — Alice's must stay 0`
  );

  // Settings are per owner, and default cleanly for a user who has none.
  await prisma.siteSettings.create({
    data: { ownerId: alice.id, siteTitleEn: "Alice Photography" }
  });
  const aliceSettings = await getSiteSettings(alice.id);
  const bobSettings = await getSiteSettings(bob.id);
  report(
    "getSiteSettings: per-owner, no bleed",
    aliceSettings.siteTitleEn === "Alice Photography" && bobSettings.siteTitleEn === "",
    `Alice: '${aliceSettings.siteTitleEn}', Bob: '${bobSettings.siteTitleEn}' (Bob must be empty)`
  );

  // Deleting an owner must take their content with them.
  await prisma.user.delete({ where: { id: alice.id } });
  const orphanEvents = await prisma.event.count({ where: { id: a.event.id } });
  const orphanPhotos = await prisma.photo.count({ where: { id: a.photo.id } });
  const orphanBookings = await prisma.booking.count({ where: { id: a.booking.id } });
  report(
    "deleting a user cascades to their content",
    orphanEvents === 0 && orphanPhotos === 0 && orphanBookings === 0,
    `left ${orphanEvents} event(s), ${orphanPhotos} photo(s), ${orphanBookings} booking(s) — all must be 0`
  );

  await prisma.user.delete({ where: { id: bob.id } });
  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}`);
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
