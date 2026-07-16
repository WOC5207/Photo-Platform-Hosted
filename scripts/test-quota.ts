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
  getQuotaUsage,
  reconcileQuota,
  releaseBytes,
  reserveBytes
} from "../src/lib/quota";

const prisma = new PrismaClient();
let failures = 0;

function report(name: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}\n      ${detail}`);
  if (!ok) failures++;
}

const MB = 1024 * 1024;

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

async function main() {
  await testBasicReserve();
  await testConcurrentReserve();
  await testRelease();
  await testAdjustReservation();
  await testReconcile();
  await testQuotaIsPerAccount();
  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}`);
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
