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
  filterOwnedPhotoIdsForDeletion,
  findOwnedBooking,
  findOwnedBookingEvent,
  findOwnedDraw,
  findOwnedEntry,
  findOwnedEvent,
  findOwnedPhoto,
  findOwnedPhotoForDeletion,
  findOwnedPrize,
  findOwnedSlot
} from "../src/lib/ownership";
import { uniqueEventSlug } from "../src/lib/slug";
import { syncCreditProfiles } from "../src/lib/photoCredits";
import { getSiteSettings } from "../src/lib/settings";
import { redeemInvite } from "../src/lib/invite";
import { usernameError } from "../src/lib/username";

const prisma = new PrismaClient();
let failures = 0;

function report(name: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}\n      ${detail}`);
  if (!ok) failures++;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Registration is invite-only, so "one invite, one account" is the whole of the
 * platform's admission control. It is a check-then-write under a shared link,
 * i.e. exactly the booking race — and just as silent.
 *
 * Deterministic, not a stampede: holding the row from outside and asserting the
 * code under test blocks on it. A Promise.all stampede can pass with the lock
 * removed purely because Node issues BEGINs sequentially (see the header of
 * test-concurrency.ts).
 */
async function testInviteRedeemedOnce(issuer: User) {
  const invite = await prisma.invite.create({
    data: { code: randomUUID().replace(/-/g, ""), issuedById: issuer.id }
  });

  let release!: () => void;
  const mayCommit = new Promise<void>((r) => (release = r));

  // Hold the invite locked and mark it redeemed, without committing.
  const holder = prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Invite" WHERE id = ${invite.id} FOR UPDATE`;
      await tx.invite.update({
        where: { id: invite.id },
        data: { redeemedAt: new Date() }
      });
      await mayCommit;
    },
    { timeout: 15_000 }
  );

  await sleep(300);

  let settled = false;
  const contender = redeemInvite(invite.code, {
    username: `racer-${randomUUID().slice(0, 8)}`,
    displayName: "Racer",
    passwordHash: "not-a-real-hash"
  }).then((r) => {
    settled = true;
    return r;
  });

  await sleep(700);
  const blocked = !settled;

  release();
  await holder;
  const result = await contender;

  report(
    "invite: redeemInvite blocks on a held invite lock, then sees it is spent",
    blocked && !result.ok && result.error === "badInvite",
    blocked
      ? `blocked as expected, then returned ${result.ok ? "ok (WRONG — invite reused)" : result.error}`
      : "returned while the invite was locked — the FOR UPDATE is missing, so one invite would create two accounts"
  );

  if (result.ok) await prisma.user.delete({ where: { id: result.user.id } });
  await prisma.invite.delete({ where: { id: invite.id } }).catch(() => {});
}

/** The reserved list is what stops an account shadowing a platform route. */
function testReservedUsernames() {
  const mustReject = ["admin", "api", "u", "login", "register", "dashboard", "www", "en", "zh"];
  // Asserts they cannot be CLAIMED, not which rule catches them: "u" is a
  // single character, so the length rule rejects it before the reserved list is
  // consulted. Either way it is unclaimable, and that is the invariant.
  const rejected = mustReject.filter((n) => usernameError(n) !== null);
  report(
    "usernames: platform routes cannot be claimed",
    rejected.length === mustReject.length,
    `${rejected.length}/${mustReject.length} rejected` +
      (rejected.length === mustReject.length
        ? ""
        : ` — ALLOWED: ${mustReject.filter((n) => !rejected.includes(n)).join(", ")}`)
  );

  const badShapes = ["-nope", "a", "Nope", "no_underscores", "way-too-long-".repeat(4)];
  const caught = badShapes.filter((n) => usernameError(n) === "invalid");
  report(
    "usernames: malformed names rejected",
    caught.length === badShapes.length,
    `${caught.length}/${badShapes.length} rejected`
  );

  const ok = ["bob", "alice-2", "x9"];
  const allowed = ok.filter((n) => usernameError(n) === null);
  report(
    "usernames: ordinary names still allowed",
    allowed.length === ok.length,
    `${allowed.length}/${ok.length} allowed` +
      (allowed.length === ok.length ? "" : " — the rule is too strict, not safe")
  );
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
  const pendingPhoto = await prisma.photo.create({
    data: {
      eventId: event.id,
      filename: randomUUID().replace(/-/g, ""),
      originalName: "pending.jpg",
      width: 1,
      height: 1,
      pendingBatchId: randomUUID(),
      uploadState: "pending"
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
  return {
    event,
    photo,
    pendingPhoto,
    bookingEvent,
    slot,
    booking,
    draw,
    prize,
    entry
  };
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

  const pendingAsNormal = await findOwnedPhoto(a.pendingPhoto.id, alice);
  const pendingForDeletion = await findOwnedPhotoForDeletion(
    a.pendingPhoto.id,
    alice
  );
  const foreignPendingForDeletion = await findOwnedPhotoForDeletion(
    a.pendingPhoto.id,
    bob
  );
  report(
    "pending photos: hidden from normal actions but available to their owner for discard",
    pendingAsNormal === null &&
      pendingForDeletion !== null &&
      foreignPendingForDeletion === null,
    `normal=${pendingAsNormal ? "VISIBLE" : "hidden"}, owner discard=${pendingForDeletion ? "allowed" : "refused"}, foreign discard=${foreignPendingForDeletion ? "ALLOWED" : "refused"}`
  );

  const normalPendingIds = await filterOwnedPhotoIds([a.pendingPhoto.id], alice);
  const discardPendingIds = await filterOwnedPhotoIdsForDeletion(
    [a.pendingPhoto.id],
    alice
  );
  report(
    "pending photos: bulk normal actions drop them while deletion keeps owned ids",
    normalPendingIds.length === 0 && discardPendingIds.length === 1,
    `normal kept ${normalPendingIds.length}, deletion kept ${discardPendingIds.length}`
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

  await testInviteRedeemedOnce(bob);
  testReservedUsernames();

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
