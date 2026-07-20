/**
 * Storage quota tests.
 *
 * The quota's whole job is to be true at the moment it is acted on. The counter
 * exists (rather than a SUM) precisely so the check and the reservation are one
 * statement — so the tests that matter are the concurrent ones, where a
 * check-then-write would let two uploads through a limit only one fits under.
 *
 * Run against a disposable database:
 *   npm run test:quota
 */
import { randomUUID } from "crypto";
import { PrismaClient, type User } from "@prisma/client";
import {
  adjustReservation,
  deleteOwnedPhotoRowsAndRelease,
  deleteSiteImageRowAndRelease,
  getEffectiveTierAccountCounts,
  getQuotaUsage,
  reconcileQuota,
  releaseBytes,
  reserveBytes
} from "../src/lib/quota";
import { resolveAssignment } from "../src/lib/tiers";

const prisma = new PrismaClient();
let failures = 0;

function report(name: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}\n      ${detail}`);
  if (!ok) failures++;
}

const MB = 1024 * 1024;

/**
 * An account with a per-account override of `quotaBytes`.
 *
 * The override is the simplest way to pin an exact allowance for the tests
 * below that are about reserve/release arithmetic rather than about tiers.
 * The tier-specific tests further down deliberately leave it NULL, so that the
 * allowance has to come through the tier for them to pass.
 */
async function makeUser(quotaBytes: number): Promise<User> {
  return prisma.user.create({
    data: {
      username: `quota-${randomUUID().slice(0, 8)}`,
      passwordHash: "not-a-real-hash",
      role: "user",
      quotaBytes: BigInt(quotaBytes),
      usedBytes: 0
    }
  });
}

/** A throwaway named tier. Never a default — only one row may hold that. */
async function makeTier(label: string, quotaBytes: number) {
  return prisma.tier.create({
    data: {
      name: `${label}-${randomUUID().slice(0, 8)}`,
      quotaBytes: BigInt(quotaBytes)
    }
  });
}

/**
 * An account whose allowance comes from a tier: no override unless one is
 * asked for. `tierId: null` means "on the default tier" — the same state every
 * newly registered account is in.
 */
async function makeTieredUser(opts: {
  tierId?: string | null;
  expiresAt?: Date | null;
  override?: number | null;
}): Promise<User> {
  return prisma.user.create({
    data: {
      username: `quota-${randomUUID().slice(0, 8)}`,
      passwordHash: "not-a-real-hash",
      role: "user",
      tierId: opts.tierId ?? null,
      tierExpiresAt: opts.expiresAt ?? null,
      quotaBytes: opts.override != null ? BigInt(opts.override) : null,
      usedBytes: 0
    }
  });
}

/**
 * The seeded default tier. Read rather than hardcoded: its allowance is the
 * admin's to change, and a test that assumes 5 GiB would start failing for a
 * reason that has nothing to do with the rule it is checking.
 */
async function defaultTierQuota(): Promise<number> {
  const t = await prisma.tier.findFirstOrThrow({ where: { isDefault: true } });
  return Number(t.quotaBytes);
}

async function used(userId: string): Promise<number> {
  return (await getQuotaUsage(userId)).usedBytes;
}

/** The basics: a reservation that fits is taken, one that does not is refused. */
async function testBasicReserve() {
  const u = await makeUser(10 * MB);

  const first = await reserveBytes(u.id, 6 * MB);
  const second = await reserveBytes(u.id, 6 * MB);
  const after = await used(u.id);

  report(
    "quota: a reservation that would exceed the cap is refused",
    first && !second && after === 6 * MB,
    `first=${first} second=${second} used=${(after / MB).toFixed(0)}MB (want true/false/6MB)`
  );

  // An over-quota reservation must change nothing at all, not partially apply.
  report(
    "quota: a refused reservation leaves the counter untouched",
    after === 6 * MB,
    `used=${(after / MB).toFixed(0)}MB, want 6MB`
  );

  await prisma.user.delete({ where: { id: u.id } });
}

/**
 * The reason the counter exists. Twenty uploads, each 1MB, against a 10MB cap:
 * exactly ten may pass. A SUM-then-check would let all twenty through, because
 * they all read the same stale total before any of them wrote.
 */
async function testConcurrentReserve() {
  const u = await makeUser(10 * MB);

  const results = await Promise.all(
    Array.from({ length: 20 }, () => reserveBytes(u.id, 1 * MB))
  );
  const granted = results.filter(Boolean).length;
  const after = await used(u.id);

  report(
    "quota: 20 concurrent 1MB reservations against a 10MB cap grant exactly 10",
    granted === 10 && after === 10 * MB,
    `${granted} granted, used=${(after / MB).toFixed(1)}MB (both must be 10)`
  );

  // The counter must equal what was actually handed out.
  //
  // Deliberately NOT "used <= cap": a lost update corrupts the counter
  // *downwards* (every writer reads the same stale total, last write wins), so
  // a broken implementation lands well under the cap and sails through that
  // check while having granted twice the space. Asking whether the counter
  // agrees with the grants is the question with an honest answer.
  report(
    "quota: the counter agrees with what was granted (no lost updates)",
    after === granted * MB,
    `used=${(after / MB).toFixed(1)}MB vs ${granted} granted — must match, or reservations were lost`
  );

  await prisma.user.delete({ where: { id: u.id } });
}

/** Release hands space back, and cannot drive the counter negative. */
async function testRelease() {
  const u = await makeUser(10 * MB);
  await reserveBytes(u.id, 5 * MB);
  await releaseBytes(u.id, 2 * MB);
  const after = await used(u.id);
  report(
    "quota: releasing returns space",
    after === 3 * MB,
    `used=${(after / MB).toFixed(0)}MB, want 3MB`
  );

  // A drifted counter must not go negative and start handing out free space.
  await releaseBytes(u.id, 99 * MB);
  const floored = await used(u.id);
  report(
    "quota: over-releasing clamps at zero rather than going negative",
    floored === 0,
    `used=${floored}, want 0`
  );

  await prisma.user.delete({ where: { id: u.id } });
}

/** Uploads reserve an estimate, then correct it once the real size is known. */
async function testAdjustReservation() {
  const u = await makeUser(100 * MB);

  await reserveBytes(u.id, 10 * MB);
  await adjustReservation(u.id, 10 * MB, 4 * MB); // renditions came out smaller
  const down = await used(u.id);
  report(
    "quota: truing up a generous estimate returns the difference",
    down === 4 * MB,
    `used=${(down / MB).toFixed(0)}MB, want 4MB`
  );

  await adjustReservation(u.id, 4 * MB, 7 * MB); // and can correct upwards
  const up = await used(u.id);
  report(
    "quota: truing up an under-estimate charges the difference",
    up === 7 * MB,
    `used=${(up / MB).toFixed(0)}MB, want 7MB`
  );

  await prisma.user.delete({ where: { id: u.id } });
}

/** Reconcile is the escape hatch for a counter that has drifted. */
async function testReconcile() {
  const u = await makeUser(100 * MB);
  const event = await prisma.event.create({
    data: { ownerId: u.id, slug: "s", titleEn: "t", titleZh: "t" }
  });
  await prisma.photo.createMany({
    data: [1, 2, 3].map((n) => ({
      eventId: event.id,
      filename: `f${n}`,
      originalName: `f${n}.jpg`,
      width: 1,
      height: 1,
      bytes: n * MB
    }))
  });
  await prisma.siteImage.create({
    data: { ownerId: u.id, token: randomUUID().replace(/-/g, ""), purpose: "logo", bytes: 4 * MB }
  });

  // Drift it badly in both directions and confirm it recovers either way.
  await prisma.user.update({
    where: { id: u.id },
    data: { usedBytes: BigInt(99 * MB) }
  });
  const high = await reconcileQuota(u.id);
  report(
    "quota: reconcile corrects a counter that drifted high",
    high.usedBytes === 10 * MB,
    `recomputed ${(high.usedBytes / MB).toFixed(0)}MB, want 10MB (1+2+3 photos + 4 site image)`
  );

  await prisma.user.update({ where: { id: u.id }, data: { usedBytes: 0n } });
  const low = await reconcileQuota(u.id);
  report(
    "quota: reconcile corrects a counter that drifted low",
    low.usedBytes === 10 * MB,
    `recomputed ${(low.usedBytes / MB).toFixed(0)}MB, want 10MB`
  );

  report(
    "quota: reconcile counts site images, not just photos",
    low.usedBytes === 10 * MB && low.usedBytes > 6 * MB,
    low.usedBytes === 10 * MB
      ? "site image's 4MB included"
      : `got ${(low.usedBytes / MB).toFixed(0)}MB — site images appear to be missing`
  );

  await prisma.user.delete({ where: { id: u.id } });
}

/**
 * Pending (unpublished) photos no longer count toward the storage quota — they
 * are compressed in the background and charged to usedBytes only at publish.
 * Reconcile must therefore keep them out of usedBytes and account them in
 * pendingBytes instead.
 */
async function testPendingExcludedFromQuota() {
  const u = await makeUser(100 * MB);
  const event = await prisma.event.create({
    data: { ownerId: u.id, slug: "pending", titleEn: "t", titleZh: "t" }
  });
  // One published photo (counts toward the quota) …
  await prisma.photo.create({
    data: {
      eventId: event.id,
      filename: "published",
      originalName: "published.jpg",
      width: 1,
      height: 1,
      bytes: 5 * MB
    }
  });
  // … and two pending ones (must not count toward the quota).
  await prisma.photo.createMany({
    data: [1, 2].map((n) => ({
      eventId: event.id,
      filename: `pending${n}`,
      originalName: `pending${n}.jpg`,
      width: 1,
      height: 1,
      bytes: n * MB,
      pendingBatchId: "batch",
      uploadState: "pending"
    }))
  });

  const usage = await reconcileQuota(u.id);
  report(
    "quota: pending photos are excluded from usedBytes",
    usage.usedBytes === 5 * MB,
    `used=${(usage.usedBytes / MB).toFixed(0)}MB, want 5MB (only the published photo)`
  );
  report(
    "quota: pending photos are tracked in pendingBytes",
    usage.pendingBytes === 3 * MB,
    `pending=${(usage.pendingBytes / MB).toFixed(0)}MB, want 3MB (1+2 pending)`
  );

  await prisma.user.delete({ where: { id: u.id } });
}

/** Quotas are per account: one user's usage must not touch another's. */
async function testQuotaIsPerAccount() {
  const a = await makeUser(10 * MB);
  const b = await makeUser(10 * MB);

  await reserveBytes(a.id, 8 * MB);
  const bUsed = await used(b.id);
  const bCanStillUpload = await reserveBytes(b.id, 8 * MB);

  report(
    "quota: one account's usage does not consume another's",
    bUsed === 0 && bCanStillUpload,
    `b used=${bUsed} (want 0), b could reserve=${bCanStillUpload} (want true)`
  );

  await prisma.user.delete({ where: { id: a.id } });
  await prisma.user.delete({ where: { id: b.id } });
}

/** An account with no tier assigned is on the default one. */
async function testDefaultTierApplies() {
  const u = await makeTieredUser({});
  const usage = await getQuotaUsage(u.id);
  const expected = await defaultTierQuota();

  report(
    "tier: an account with nothing assigned gets the default tier's allowance",
    usage.quotaBytes === expected && !usage.overridden && !usage.expired,
    `quota=${usage.quotaBytes} (want ${expected}), tier="${usage.tierName}", overridden=${usage.overridden} (want false)`
  );

  await prisma.user.delete({ where: { id: u.id } });
}

/** An assigned tier sets the allowance, and is actually enforced. */
async function testAssignedTierApplies() {
  const pro = await makeTier("pro", 50 * MB);
  const u = await makeTieredUser({ tierId: pro.id });

  const usage = await getQuotaUsage(u.id);
  const fits = await reserveBytes(u.id, 40 * MB);
  const doesNot = await reserveBytes(u.id, 20 * MB); // 40+20 > 50

  report(
    "tier: an assigned tier sets the allowance, and the upload check honours it",
    usage.quotaBytes === 50 * MB && usage.tierName === pro.name && fits && !doesNot,
    `quota=${(usage.quotaBytes / MB).toFixed(0)}MB (want 50), tier="${usage.tierName}", 40MB=${fits} (want true), +20MB=${doesNot} (want false)`
  );

  await prisma.user.delete({ where: { id: u.id } });
  await prisma.tier.delete({ where: { id: pro.id } });
}

/** A per-account override beats the tier it is on. */
async function testOverrideBeatsTier() {
  const pro = await makeTier("pro", 50 * MB);
  const u = await makeTieredUser({ tierId: pro.id, override: 5 * MB });

  const usage = await getQuotaUsage(u.id);
  const refused = await reserveBytes(u.id, 6 * MB);

  report(
    "tier: a per-account override beats the tier's allowance",
    usage.quotaBytes === 5 * MB && usage.overridden && !refused,
    `quota=${(usage.quotaBytes / MB).toFixed(0)}MB (want 5, not the tier's 50), overridden=${usage.overridden} (want true), 6MB reserve=${refused} (want false)`
  );

  await prisma.user.delete({ where: { id: u.id } });
  await prisma.tier.delete({ where: { id: pro.id } });
}

/**
 * The point of the expiry: it needs nothing to run.
 *
 * No job rewrites these rows — the date passing is the whole event. So the very
 * next read, with nothing having happened in between, must already report the
 * default tier and enforce it.
 */
async function testExpiredAssignmentFallsBackToDefault() {
  const dflt = await defaultTierQuota();
  // Deliberately TWICE the default, so the reservation below can sit in the gap
  // between the two — big enough that the default refuses it, small enough that
  // the assigned tier would allow it. A tier smaller than the default cannot
  // test this: an amount over both limits is refused whether expiry works or
  // not, which is a pass that means nothing. No disk is involved; these are
  // counter arithmetic only.
  const pro = await makeTier("pro", dflt * 2);
  const between = dflt + MB;

  const future = await makeTieredUser({
    tierId: pro.id,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000)
  });
  const live = await getQuotaUsage(future.id);
  const liveAllows = await reserveBytes(future.id, between);
  report(
    "tier: an assignment that has not expired yet still applies",
    live.quotaBytes === dflt * 2 && !live.expired && liveAllows,
    `quota=${live.quotaBytes} (want ${dflt * 2}), expired=${live.expired} (want false), reserving ${between} = ${liveAllows} (want true — over the default, under this tier)`
  );

  const past = await makeTieredUser({
    tierId: pro.id,
    expiresAt: new Date(Date.now() - 1000)
  });
  const lapsed = await getQuotaUsage(past.id);
  report(
    "tier: an expired assignment falls back to the default tier with nothing having run",
    lapsed.quotaBytes === dflt && lapsed.expired,
    `quota=${lapsed.quotaBytes} (want the default tier's ${dflt}, not the assigned tier's ${dflt * 2}), expired=${lapsed.expired} (want true)`
  );

  // Not merely cosmetic: the upload check must refuse what the lapsed tier
  // would have allowed. Same amount the un-expired account above was granted,
  // so the only difference between true and false here is the expiry.
  const overDefault = await reserveBytes(past.id, between);
  report(
    "tier: an expired assignment is enforced, not just displayed",
    !overDefault,
    `reserving ${between} = ${overDefault} (want false) — the un-expired account was granted this exact amount`
  );

  await prisma.user.delete({ where: { id: future.id } });
  await prisma.user.delete({ where: { id: past.id } });
  await prisma.tier.delete({ where: { id: pro.id } });
}

/** Concurrent retries must release only rows the caller actually deleted. */
async function testConditionalDeleteRelease() {
  const u = await makeUser(100 * MB);
  const event = await prisma.event.create({
    data: {
      ownerId: u.id,
      slug: `delete-${randomUUID().slice(0, 8)}`,
      titleEn: "Delete race",
      titleZh: "Delete race"
    }
  });
  const photos = await Promise.all(
    [2, 3].map((size, index) =>
      prisma.photo.create({
        data: {
          eventId: event.id,
          filename: `delete-${index}.jpg`,
          originalName: `delete-${index}.jpg`,
          width: 1,
          height: 1,
          bytes: size * MB
        }
      })
    )
  );
  const siteToken = randomUUID().replace(/-/g, "");
  await prisma.siteImage.create({
    data: { ownerId: u.id, token: siteToken, purpose: "logo", bytes: 4 * MB }
  });
  await prisma.user.update({
    where: { id: u.id },
    data: { usedBytes: BigInt(9 * MB) }
  });

  const photoReleases = await Promise.all([
    deleteOwnedPhotoRowsAndRelease(u.id, photos.map((photo) => photo.id)),
    deleteOwnedPhotoRowsAndRelease(u.id, photos.map((photo) => photo.id))
  ]);
  const siteReleases = await Promise.all([
    deleteSiteImageRowAndRelease(u.id, siteToken),
    deleteSiteImageRowAndRelease(u.id, siteToken)
  ]);
  const after = await used(u.id);

  report(
    "quota: concurrent photo deletion releases each row exactly once",
    photoReleases.reduce((sum, bytes) => sum + bytes, 0) === 5 * MB,
    `released ${photoReleases.join(" + ")} bytes (want ${5 * MB} total)`
  );
  report(
    "quota: concurrent site-image deletion releases each row exactly once",
    siteReleases.reduce((sum, bytes) => sum + bytes, 0) === 4 * MB,
    `released ${siteReleases.join(" + ")} bytes (want ${4 * MB} total)`
  );
  report(
    "quota: conditional deletion leaves the usage counter exact",
    after === 0,
    `used=${after}, want 0 after releasing 9MB exactly once`
  );

  await prisma.user.delete({ where: { id: u.id } });
}

/** Tier-page counts must describe the tier in force, not the stored FK. */
async function testEffectiveTierAccountCounts() {
  const defaultTier = await prisma.tier.findFirstOrThrow({
    where: { isDefault: true }
  });
  const assignedTier = await makeTier("counted", 50 * MB);
  const before = await getEffectiveTierAccountCounts();

  const inheritedDefault = await makeTieredUser({});
  const activeAssignment = await makeTieredUser({ tierId: assignedTier.id });
  const expiredAssignment = await makeTieredUser({
    tierId: assignedTier.id,
    expiresAt: new Date(Date.now() - 1000)
  });

  const after = await getEffectiveTierAccountCounts();
  const defaultDelta =
    (after.get(defaultTier.id) ?? 0) - (before.get(defaultTier.id) ?? 0);
  const assignedDelta =
    (after.get(assignedTier.id) ?? 0) - (before.get(assignedTier.id) ?? 0);

  report(
    "tier counts: inherited and expired assignments count against the default",
    defaultDelta === 2,
    `default gained ${defaultDelta} accounts (want 2: inherited + expired)`
  );
  report(
    "tier counts: only an active assignment counts against a named tier",
    assignedDelta === 1,
    `assigned tier gained ${assignedDelta} accounts (want 1: active only)`
  );

  await prisma.user.delete({ where: { id: inheritedDefault.id } });
  await prisma.user.delete({ where: { id: activeAssignment.id } });
  await prisma.user.delete({ where: { id: expiredAssignment.id } });
  await prisma.tier.delete({ where: { id: assignedTier.id } });
}

/**
 * The check is still one statement.
 *
 * The allowance now arrives via a subquery over Tier rather than a column on
 * the row being updated, which is exactly the kind of change that quietly
 * reintroduces a read-then-write. Same shape as the concurrency test above, but
 * with the limit coming from a tier and no override in sight.
 */
async function testConcurrentReserveAgainstTier() {
  const tier = await makeTier("small", 10 * MB);
  const u = await makeTieredUser({ tierId: tier.id });

  const results = await Promise.all(
    Array.from({ length: 20 }, () => reserveBytes(u.id, 1 * MB))
  );
  const granted = results.filter(Boolean).length;
  const after = await used(u.id);

  report(
    "tier: 20 concurrent 1MB reservations against a 10MB TIER grant exactly 10",
    granted === 10 && after === 10 * MB && after === granted * MB,
    `${granted} granted (want 10), used=${(after / MB).toFixed(1)}MB (want 10) — the tier subquery must not have cost us atomicity`
  );

  await prisma.user.delete({ where: { id: u.id } });
  await prisma.tier.delete({ where: { id: tier.id } });
}

/**
 * What the admin's assignment form means.
 *
 * The end-of-day rule is the kind of thing that looks right and is off by a
 * day: `new Date("2026-08-01")` is midnight UTC, so an admin typing today's
 * date would find the tier already lapsed — and would have no reason to suspect
 * the date field rather than the tier.
 */
async function testAssignmentRules() {
  const midday = resolveAssignment("tier-1", "2026-08-01");
  const end = midday.expiresAt!;
  report(
    "assignment: a date means the END of that day, not midnight",
    end.getHours() === 23 && end.getMinutes() === 59 &&
      end.getFullYear() === 2026 && end.getMonth() === 7 && end.getDate() === 1,
    `parsed as ${end.toString()} — want 2026-08-01 23:59:59 local, or "expires today" lapses this morning`
  );

  const noTier = resolveAssignment("", "2026-08-01");
  report(
    "assignment: an expiry without a tier is dropped",
    noTier.tierId === null && noTier.expiresAt === null,
    `tierId=${noTier.tierId} expiresAt=${noTier.expiresAt} — both must be null; the default has nothing to lapse to`
  );

  const noExpiry = resolveAssignment("tier-1", "");
  report(
    "assignment: a tier with no date never expires",
    noExpiry.tierId === "tier-1" && noExpiry.expiresAt === null,
    `tierId=${noExpiry.tierId} expiresAt=${noExpiry.expiresAt} (want tier-1 / null)`
  );

  const junk = resolveAssignment("tier-1", "not-a-date");
  report(
    "assignment: an unparseable date is ignored rather than becoming Invalid Date",
    junk.tierId === "tier-1" && junk.expiresAt === null,
    `expiresAt=${junk.expiresAt} — an Invalid Date written to the column would make the tier expire never or always`
  );
}

async function main() {
  await testAssignmentRules();
  await testBasicReserve();
  await testConcurrentReserve();
  await testRelease();
  await testAdjustReservation();
  await testReconcile();
  await testPendingExcludedFromQuota();
  await testConditionalDeleteRelease();
  await testQuotaIsPerAccount();
  await testDefaultTierApplies();
  await testAssignedTierApplies();
  await testOverrideBeatsTier();
  await testExpiredAssignmentFallsBackToDefault();
  await testEffectiveTierAccountCounts();
  await testConcurrentReserveAgainstTier();
  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}`);
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
