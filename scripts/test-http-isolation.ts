/**
 * Cross-tenant penetration pass over the real HTTP surface.
 *
 * test-tenant-isolation.ts proves the ownership *helpers* refuse a foreign id.
 * This proves the routes actually call them — a guard nothing invokes is not a
 * guard, and that gap is invisible to both the typechecker and the other suite.
 *
 * Builds two real accounts with real session cookies, then has Bob attack every
 * API route with Alice's ids and asserts each one refuses. Everything here is a
 * request the app itself makes; nothing is crafted beyond swapping whose ids go
 * in the body.
 *
 * Needs the dev server running:
 *   npm run dev
 *   npm run test:http
 */
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { sealData } from "iron-session";
import sharp from "sharp";
import bcrypt from "bcryptjs";
import { PrismaClient, type User } from "@prisma/client";
import { siteDir } from "../src/lib/images";

const prisma = new PrismaClient();
const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
let failures = 0;

function report(name: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}\n      ${detail}`);
  if (!ok) failures++;
}

async function cookieFor(user: User): Promise<string> {
  const sealed = await sealData(
    { userId: user.id },
    { password: process.env.SESSION_SECRET!, ttl: 0 }
  );
  return `session=${sealed}`;
}

async function makeUser(name: string): Promise<User> {
  return prisma.user.create({
    data: {
      username: `${name}-${randomUUID().slice(0, 8)}`,
      displayName: name,
      passwordHash: await bcrypt.hash("irrelevant-for-these-tests", 4),
      role: "user",
      quotaBytes: BigInt(100 * 1024 * 1024),
      settings: { create: { setupCompleted: true } }
    }
  });
}

/**
 * A small real JPEG to upload. Returns an ArrayBuffer rather than sharp's
 * Buffer: Buffer is a Uint8Array at runtime, but its type is not assignable to
 * BlobPart here, and an ArrayBuffer is — no cast needed.
 */
async function jpeg(): Promise<ArrayBuffer> {
  const buf = await sharp({
    create: { width: 40, height: 30, channels: 3, background: "#888" }
  })
    .jpeg()
    .toBuffer();
  const out = new ArrayBuffer(buf.byteLength);
  new Uint8Array(out).set(buf);
  return out;
}

async function main() {
  const alice = await makeUser("alice");
  const bob = await makeUser("bob");
  const aliceCookie = await cookieFor(alice);
  const bobCookie = await cookieFor(bob);

  // Alice's content: one unpublished album with a real photo, and an
  // announcement. Unpublished on purpose — that plus originals are the two
  // things only an owner may see.
  const aliceEvent = await prisma.event.create({
    data: { ownerId: alice.id, slug: "private", titleEn: "Alice", titleZh: "Alice", published: false }
  });
  const aliceAnnouncement = await prisma.announcement.create({
    data: { ownerId: alice.id, titleEn: "A", titleZh: "A" }
  });

  // Upload through the real route so the files genuinely exist on disk.
  const uploadId = randomUUID().replace(/-/g, "");
  const batchId = randomUUID();
  const upload = new FormData();
  upload.append("eventId", aliceEvent.id);
  upload.append("batchId", batchId);
  upload.append("uploadId", uploadId);
  upload.append("storagePreset", "balanced");
  upload.append("file", new Blob([await jpeg()], { type: "image/jpeg" }), "a.jpg");
  const uploadRes = await fetch(`${BASE}/api/admin/photos`, {
    method: "POST",
    headers: { cookie: aliceCookie },
    body: upload
  });
  const uploaded = await uploadRes.json();
  report(
    "setup: Alice can upload a pending photo to her own album",
    uploadRes.status === 201 && !!uploaded.id,
    `HTTP ${uploadRes.status} ${JSON.stringify(uploaded)}` +
      (uploadRes.status === 201 ? "" : " — the suite below proves nothing if this fails")
  );
  const photoId: string = uploaded.id;

  const retryUpload = new FormData();
  retryUpload.append("eventId", aliceEvent.id);
  retryUpload.append("batchId", batchId);
  retryUpload.append("uploadId", uploadId);
  retryUpload.append("storagePreset", "balanced");
  retryUpload.append(
    "file",
    new Blob([await jpeg()], { type: "image/jpeg" }),
    "a.jpg"
  );
  const retryUploadRes = await fetch(`${BASE}/api/admin/photos`, {
    method: "POST",
    headers: { cookie: aliceCookie },
    body: retryUpload
  });
  const pendingRowsAfterRetry = await prisma.photo.count({
    where: { id: uploadId }
  });
  report(
    "pending queue: retrying one upload id is idempotent",
    retryUploadRes.status === 200 && pendingRowsAfterRetry === 1,
    `HTTP ${retryUploadRes.status}, ${pendingRowsAfterRetry} row(s) (want 1)`
  );

  const pendingWithComparison = await prisma.photo.findUniqueOrThrow({
    where: { id: uploadId }
  });
  report(
    "pending queue: exact source/candidate/rendition sizes are durable",
    pendingWithComparison.sourceBytes !== null &&
      pendingWithComparison.candidateBytes !== null &&
      pendingWithComparison.renditionBytes !== null &&
      pendingWithComparison.bytes ===
        pendingWithComparison.sourceBytes +
          pendingWithComparison.candidateBytes +
          pendingWithComparison.renditionBytes,
    `source=${pendingWithComparison.sourceBytes}, candidate=${pendingWithComparison.candidateBytes}, renditions=${pendingWithComparison.renditionBytes}, total=${pendingWithComparison.bytes}`
  );

  const foreignPreset = await fetch(`${BASE}/api/admin/photos`, {
    method: "PUT",
    headers: { cookie: bobCookie, "content-type": "application/json" },
    body: JSON.stringify({ photoId, storagePreset: "archive" })
  });
  report(
    "pending queue: another account cannot change Alice's storage quality",
    foreignPreset.status === 404,
    `HTTP ${foreignPreset.status} (want 404)`
  );

  const archivePreset = await fetch(`${BASE}/api/admin/photos`, {
    method: "PUT",
    headers: { cookie: aliceCookie, "content-type": "application/json" },
    body: JSON.stringify({ photoId, storagePreset: "archive" })
  });
  const archiveRow = await prisma.photo.findUniqueOrThrow({
    where: { id: uploadId }
  });
  report(
    "pending queue: owner can regenerate and persist an Archive candidate",
    archivePreset.status === 200 &&
      archiveRow.storagePreset === "archive" &&
      archiveRow.candidatePreset === "archive" &&
      archiveRow.uploadState === "pending",
    `HTTP ${archivePreset.status}, selected=${archiveRow.storagePreset}, candidate=${archiveRow.candidatePreset}, state=${archiveRow.uploadState}`
  );

  await prisma.event.update({
    where: { id: aliceEvent.id },
    data: { published: true }
  });
  await prisma.user.update({ where: { id: bob.id }, data: { role: "admin" } });
  const pendingVariants = ["med.webp", "full.webp", "orig.jpg"];
  const pendingStatuses: string[] = [];
  for (const variant of pendingVariants) {
    const url = `${BASE}/api/images/${aliceEvent.id}/${photoId}-${variant}`;
    const [anon, owner, admin] = await Promise.all([
      fetch(url),
      fetch(url, { headers: { cookie: aliceCookie } }),
      fetch(url, { headers: { cookie: bobCookie } })
    ]);
    pendingStatuses.push(
      `${variant}: anon=${anon.status} owner=${owner.status} admin=${admin.status}`
    );
  }
  report(
    "pending queue: non-preview image variants stay private before Create",
    pendingStatuses.every((status) =>
      status.includes("anon=404 owner=404 admin=404")
    ),
    pendingStatuses.join(", ")
  );

  const pendingThumbUrl = `${BASE}/api/images/${aliceEvent.id}/${photoId}-thumb.webp`;
  const [anonymousThumb, ownerThumb, adminThumb] = await Promise.all([
    fetch(pendingThumbUrl),
    fetch(pendingThumbUrl, { headers: { cookie: aliceCookie } }),
    fetch(pendingThumbUrl, { headers: { cookie: bobCookie } })
  ]);
  report(
    "pending queue: thumbnail preview is private to the owner and platform admin",
    anonymousThumb.status === 404 &&
      ownerThumb.status === 200 &&
      adminThumb.status === 200 &&
      ownerThumb.headers.get("cache-control") === "private, no-store" &&
      ownerThumb.headers.get("vary")?.toLowerCase().includes("cookie") === true &&
      ownerThumb.headers.get("x-content-type-options") === "nosniff",
    `anon=${anonymousThumb.status}, owner=${ownerThumb.status}, admin=${adminThumb.status}, ` +
      `cache=${ownerThumb.headers.get("cache-control")}, vary=${ownerThumb.headers.get("vary")}`
  );

  const publicPendingAlbum = await fetch(
    `${BASE}/en/u/${alice.username}/gallery/${aliceEvent.slug}`
  );
  const publicPendingHtml = await publicPendingAlbum.text();
  report(
    "pending queue: a published album does not render pending photos",
    publicPendingAlbum.status === 200 && !publicPendingHtml.includes(photoId),
    `HTTP ${publicPendingAlbum.status}, photo id ${publicPendingHtml.includes(photoId) ? "LEAKED" : "absent"}`
  );

  await prisma.user.update({ where: { id: bob.id }, data: { role: "user" } });
  await prisma.event.update({
    where: { id: aliceEvent.id },
    data: { published: false }
  });

  const finalizeBody = JSON.stringify({
    eventId: aliceEvent.id,
    photoIds: [photoId],
    credits: JSON.stringify([
      { creditName: "Jane", subject: "", socialLinks: [] }
    ])
  });
  const foreignFinalize = await fetch(`${BASE}/api/admin/photos`, {
    method: "PATCH",
    headers: { cookie: bobCookie, "content-type": "application/json" },
    body: finalizeBody
  });
  report(
    "pending queue: another account cannot finalize Alice's queue",
    foreignFinalize.status === 404,
    `HTTP ${foreignFinalize.status} (want 404)`
  );

  const foreignDiscard = await fetch(`${BASE}/api/admin/photos`, {
    method: "DELETE",
    headers: { cookie: bobCookie, "content-type": "application/json" },
    body: JSON.stringify({ photoId })
  });
  const rowAfterForeignDiscard = await prisma.photo.count({
    where: { id: photoId }
  });
  report(
    "pending queue: another account cannot discard Alice's upload",
    foreignDiscard.status === 200 && rowAfterForeignDiscard === 1,
    `HTTP ${foreignDiscard.status}, row count=${rowAfterForeignDiscard} (want 1)`
  );

  const finalizeRes = await fetch(`${BASE}/api/admin/photos`, {
    method: "PATCH",
    headers: { cookie: aliceCookie, "content-type": "application/json" },
    body: finalizeBody
  });
  const finalized = await prisma.photo.findUnique({ where: { id: photoId } });
  report(
    "pending queue: Create finalizes the exact owned photo",
    finalizeRes.status === 200 &&
      finalized?.pendingBatchId === null &&
      finalized.sourceFilename === null &&
      finalized.filename.includes("-orig.") &&
      finalized.bytes < archiveRow.bytes,
    `HTTP ${finalizeRes.status}, pendingBatchId=${finalized?.pendingBatchId ?? "null"}, filename=${finalized?.filename}, bytes=${finalized?.bytes}`
  );

  const finalizeRetry = await fetch(`${BASE}/api/admin/photos`, {
    method: "PATCH",
    headers: { cookie: aliceCookie, "content-type": "application/json" },
    body: finalizeBody
  });
  const creditsAfterFinalizeRetry = await prisma.photoCredit.count({
    where: { photoId }
  });
  report(
    "pending queue: retrying Create is idempotent",
    finalizeRetry.status === 200 && creditsAfterFinalizeRetry === 1,
    `HTTP ${finalizeRetry.status}, ${creditsAfterFinalizeRetry} credit row(s) (want 1)`
  );

  const mismatchedFinalize = await fetch(`${BASE}/api/admin/photos`, {
    method: "PATCH",
    headers: { cookie: aliceCookie, "content-type": "application/json" },
    body: JSON.stringify({
      eventId: aliceEvent.id,
      photoIds: [photoId],
      credits: JSON.stringify([
        { creditName: "Different person", subject: "", socialLinks: [] }
      ])
    })
  });
  const creditsAfterMismatch = await prisma.photoCredit.findMany({
    where: { photoId },
    select: { creditName: true }
  });
  report(
    "pending queue: an idempotent Create retry cannot change attribution",
    mismatchedFinalize.status === 409 &&
      creditsAfterMismatch.length === 1 &&
      creditsAfterMismatch[0].creditName === "Jane",
    `HTTP ${mismatchedFinalize.status}, stored=${creditsAfterMismatch.map((credit) => credit.creditName).join(",")}`
  );

  const beforeStalledCleanup = await prisma.user.findUniqueOrThrow({
    where: { id: alice.id },
    select: { usedBytes: true }
  });
  const stalledId = randomUUID().replace(/-/g, "");
  const stalledBytes = 321;
  await prisma.$transaction([
    prisma.user.update({
      where: { id: alice.id },
      data: { usedBytes: { increment: stalledBytes } }
    }),
    prisma.photo.create({
      data: {
        id: stalledId,
        eventId: aliceEvent.id,
        filename: `${stalledId}-orig.jpg`,
        originalName: "interrupted.jpg",
        width: 1,
        height: 1,
        bytes: stalledBytes,
        pendingBatchId: randomUUID(),
        uploadState: "processing"
      }
    })
  ]);
  const stalledDiscard = await fetch(`${BASE}/api/admin/photos`, {
    method: "DELETE",
    headers: { cookie: aliceCookie, "content-type": "application/json" },
    body: JSON.stringify({ photoId: stalledId })
  });
  const [stalledRow, afterStalledCleanup] = await Promise.all([
    prisma.photo.findUnique({ where: { id: stalledId } }),
    prisma.user.findUniqueOrThrow({
      where: { id: alice.id },
      select: { usedBytes: true }
    })
  ]);
  report(
    "pending queue: an interrupted processing reservation can be removed",
    stalledDiscard.status === 200 &&
      stalledRow === null &&
      afterStalledCleanup.usedBytes === beforeStalledCleanup.usedBytes,
    `HTTP ${stalledDiscard.status}, row=${stalledRow ? "present" : "removed"}, ` +
      `before=${beforeStalledCleanup.usedBytes}, after=${afterStalledCleanup.usedBytes}`
  );

  const beforeDiscard = await prisma.user.findUniqueOrThrow({
    where: { id: alice.id },
    select: { usedBytes: true }
  });
  const discardId = randomUUID().replace(/-/g, "");
  const discardUpload = new FormData();
  discardUpload.append("eventId", aliceEvent.id);
  discardUpload.append("batchId", randomUUID());
  discardUpload.append("uploadId", discardId);
  discardUpload.append("storagePreset", "balanced");
  discardUpload.append(
    "file",
    new Blob([await jpeg()], { type: "image/jpeg" }),
    "discard.jpg"
  );
  const discardUploadRes = await fetch(`${BASE}/api/admin/photos`, {
    method: "POST",
    headers: { cookie: aliceCookie },
    body: discardUpload
  });
  const pendingDiscard = await prisma.photo.findUniqueOrThrow({
    where: { id: discardId }
  });
  const discardRes = await fetch(`${BASE}/api/admin/photos`, {
    method: "DELETE",
    headers: { cookie: aliceCookie, "content-type": "application/json" },
    body: JSON.stringify({ photoId: discardId })
  });
  const discardRetryRes = await fetch(`${BASE}/api/admin/photos`, {
    method: "DELETE",
    headers: { cookie: aliceCookie, "content-type": "application/json" },
    body: JSON.stringify({ photoId: discardId })
  });
  const afterDiscard = await prisma.user.findUniqueOrThrow({
    where: { id: alice.id },
    select: { usedBytes: true }
  });
  report(
    "pending queue: discard releases quota once and is idempotent",
    discardUploadRes.status === 201 &&
      discardRes.status === 200 &&
      discardRetryRes.status === 200 &&
      afterDiscard.usedBytes === beforeDiscard.usedBytes,
    `upload=${discardUploadRes.status}, delete=${discardRes.status}/${discardRetryRes.status}, ` +
      `pending bytes=${pendingDiscard.bytes}, before=${beforeDiscard.usedBytes}, after=${afterDiscard.usedBytes}`
  );

  // --- Bob attacks Alice's album -----------------------------------------

  const intoHers = new FormData();
  intoHers.append("eventId", aliceEvent.id);
  intoHers.append("batchId", randomUUID());
  intoHers.append("uploadId", randomUUID().replace(/-/g, ""));
  intoHers.append("storagePreset", "balanced");
  intoHers.append("file", new Blob([await jpeg()], { type: "image/jpeg" }), "b.jpg");
  const intoHersRes = await fetch(`${BASE}/api/admin/photos`, {
    method: "POST",
    headers: { cookie: bobCookie },
    body: intoHers
  });
  const photosInAlices = await prisma.photo.count({ where: { eventId: aliceEvent.id } });
  report(
    "POST /api/admin/photos: Bob cannot upload into Alice's album",
    intoHersRes.status === 404 && photosInAlices === 1,
    `HTTP ${intoHersRes.status} (want 404), Alice's album holds ${photosInAlices} photo(s) (want 1)`
  );

  const bobsAnnouncementUpload = new FormData();
  bobsAnnouncementUpload.append("announcementId", aliceAnnouncement.id);
  bobsAnnouncementUpload.append("file", new Blob([await jpeg()], { type: "image/jpeg" }), "b.jpg");
  const annRes = await fetch(`${BASE}/api/admin/announcement-image`, {
    method: "POST",
    headers: { cookie: bobCookie },
    body: bobsAnnouncementUpload
  });
  const ann = await prisma.announcement.findUniqueOrThrow({
    where: { id: aliceAnnouncement.id }
  });
  report(
    "POST /api/admin/announcement-image: Bob cannot attach to Alice's announcement",
    annRes.status === 404 && ann.image === "",
    `HTTP ${annRes.status} (want 404), Alice's announcement image = "${ann.image}" (want empty)`
  );

  // --- Bob reads Alice's images ------------------------------------------

  const cases: [string, string, string][] = [
    ["orig", `${BASE}/api/images/${aliceEvent.id}/${photoId}-orig.jpg`, "her original"],
    ["med", `${BASE}/api/images/${aliceEvent.id}/${photoId}-med.webp`, "an unpublished album's photo"]
  ];
  for (const [label, url, what] of cases) {
    const asBob = await fetch(url, { headers: { cookie: bobCookie } });
    const anon = await fetch(url);
    const asAlice = await fetch(url, { headers: { cookie: aliceCookie } });
    report(
      `GET /api/images (${label}): Bob and anonymous cannot read ${what}`,
      asBob.status === 404 &&
        anon.status === 404 &&
        asAlice.status === 200 &&
        asAlice.headers.get("cache-control") === "private, no-store" &&
        asAlice.headers.get("vary")?.toLowerCase().includes("cookie") === true &&
        asAlice.headers.get("x-content-type-options") === "nosniff",
      `bob=${asBob.status} anon=${anon.status} (both want 404), alice=${asAlice.status} (want 200), ` +
        `cache=${asAlice.headers.get("cache-control")}`
    );
  }

  // --- Search must not span owners ---------------------------------------

  const bobSearch = await fetch(
    `${BASE}/api/search/credits?owner=${bob.username}&q=Jane`
  ).then((r) => r.json());
  report(
    "GET /api/search/credits: searching Bob's site does not return Alice's people",
    bobSearch.results.length === 0,
    `${bobSearch.results.length} result(s) (want 0) — Alice has a credited "Jane"`
  );

  // Published so the search has something legitimate to find; Alice's own
  // search must still work, or the scoping is broken rather than safe.
  await prisma.event.update({
    where: { id: aliceEvent.id },
    data: { published: true }
  });
  const [publishedRendition, publishedOriginal] = await Promise.all([
    fetch(`${BASE}/api/images/${aliceEvent.id}/${photoId}-med.webp`),
    fetch(`${BASE}/api/images/${aliceEvent.id}/${photoId}-orig.jpg`, {
      headers: { cookie: aliceCookie }
    })
  ]);
  report(
    "GET /api/images: only a published non-original rendition is publicly immutable",
    publishedRendition.status === 200 &&
      publishedRendition.headers.get("cache-control") ===
        "public, max-age=31536000, immutable" &&
      publishedRendition.headers.get("x-content-type-options") === "nosniff" &&
      publishedOriginal.status === 200 &&
      publishedOriginal.headers.get("cache-control") === "private, no-store" &&
      publishedOriginal.headers.get("vary")?.toLowerCase().includes("cookie") === true,
    `rendition=${publishedRendition.status}/${publishedRendition.headers.get("cache-control")}, ` +
      `original=${publishedOriginal.status}/${publishedOriginal.headers.get("cache-control")}`
  );
  const aliceSearch = await fetch(
    `${BASE}/api/search/credits?owner=${alice.username}&q=Jane`
  ).then((r) => r.json());
  report(
    "GET /api/search/credits: Alice's own search still finds her people",
    aliceSearch.results.length === 1,
    `${aliceSearch.results.length} result(s) (want 1)`
  );

  const noOwner = await fetch(`${BASE}/api/search/credits?q=Jane`).then((r) => r.json());
  report(
    "GET /api/search/credits: an unscoped search returns nothing rather than everything",
    noOwner.results.length === 0,
    `${noOwner.results.length} result(s) (want 0) — omitting owner must not search the platform`
  );

  // --- The platform admin area -------------------------------------------

  const adminPage = await fetch(`${BASE}/en/admin`, {
    headers: { cookie: bobCookie },
    redirect: "manual"
  });
  report(
    "GET /en/admin: a non-admin is refused the platform tools",
    adminPage.status === 307 || adminPage.status === 302,
    `HTTP ${adminPage.status} (want a redirect away, not 200)`
  );

  // --- A suspended account disappears ------------------------------------

  // Alice's album is published as of the search checks above, which is what
  // makes the image check below meaningful: a published photo takes neither
  // the "orig" nor the "unpublished" branch in the images route.
  //
  // The file has to genuinely exist on disk, or the route 404s at its fs.stat
  // and the check passes without suspension ever being consulted.
  const siteImageToken = randomUUID().replace(/-/g, "").slice(0, 24);
  const siteFile = path.join(siteDir(alice.id), `${siteImageToken}.webp`);
  await fs.mkdir(path.dirname(siteFile), { recursive: true });
  const siteBytes = await sharp({
    create: { width: 8, height: 8, channels: 3, background: "#111" }
  })
    .webp()
    .toBuffer();
  await fs.writeFile(siteFile, siteBytes);
  await prisma.siteImage.create({
    data: {
      ownerId: alice.id,
      token: siteImageToken,
      purpose: "logo",
      bytes: siteBytes.byteLength
    }
  });
  const siteImageBefore = await fetch(`${BASE}/api/site/${siteImageToken}.webp`);
  report(
    "setup: Alice's site image serves while she is active",
    siteImageBefore.status === 200,
    `HTTP ${siteImageBefore.status} (want 200) — the suspension check below is vacuous if this 404s`
  );

  await prisma.user.update({
    where: { id: alice.id },
    data: { status: "suspended" }
  });
  const suspendedSite = await fetch(`${BASE}/en/u/${alice.username}`, {
    redirect: "manual"
  });
  const suspendedDash = await fetch(`${BASE}/en/dashboard`, {
    headers: { cookie: aliceCookie },
    redirect: "manual"
  });
  report(
    "suspension: the public site 404s and the live session stops working",
    suspendedSite.status === 404 &&
      (suspendedDash.status === 307 || suspendedDash.status === 302),
    `site=${suspendedSite.status} (want 404), dashboard=${suspendedDash.status} (want redirect) — cookie still valid`
  );

  // Suspension is the tool for taking content down, so the content is the part
  // that has to actually go. The page 404ing is not enough: these URLs are
  // public, already shared, and served immutable-cached for a year, so anyone
  // holding one keeps the photo unless the route itself refuses.
  // Only the webp: renditions are always webp, so a -med.jpg URL 404s on a
  // missing file whether or not suspension works, and would pass either way.
  const suspendedPhoto = await fetch(
    `${BASE}/api/images/${aliceEvent.id}/${photoId}-med.webp`
  );
  report(
    "suspension: a published photo stops serving from /api/images",
    suspendedPhoto.status === 404,
    `HTTP ${suspendedPhoto.status} (want 404) — the album is published, so neither ` +
      `the orig nor the unpublished branch covers it`
  );

  const suspendedSiteImage = await fetch(`${BASE}/api/site/${siteImageToken}.webp`);
  report(
    "suspension: a site image stops serving from /api/site",
    suspendedSiteImage.status === 404,
    `HTTP ${suspendedSiteImage.status} (want 404) — logos and QR codes go down with the account`
  );

  await prisma.user.delete({ where: { id: alice.id } });
  await prisma.user.delete({ where: { id: bob.id } });

  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}`);
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  console.error(
    "\nIs the dev server running? This suite drives real HTTP: npm run dev"
  );
  await prisma.$disconnect();
  process.exit(1);
});
