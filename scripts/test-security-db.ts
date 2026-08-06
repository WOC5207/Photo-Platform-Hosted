import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { redeemInvite } from "../src/lib/invite";
import { spinForEntry, uniqueEntryToken } from "../src/lib/lottery";
import { registrationNoticeHash } from "../src/lib/registrationNotice";
import { getHomePhotoStreamPage } from "../src/lib/homePhotoStream";
import { mergeStreamEvents } from "../src/lib/homePhotoStreamMerge";
import type { StreamEvent } from "../src/lib/homePhotoStreamTypes";

const prisma = new PrismaClient();

function account(username: string) {
  return {
    username,
    displayName: username,
    passwordHash: "test-only-password-hash"
  };
}

async function testRegistrationConsent() {
  const suffix = randomUUID().slice(0, 8);
  const issuer = await prisma.user.create({
    data: {
      username: `consent-admin-${suffix}`,
      passwordHash: "test-only-password-hash",
      role: "admin"
    }
  });
  const previous = await prisma.platformSettings.findUnique({ where: { id: "platform" } });
  const notice = await prisma.platformSettings.upsert({
    where: { id: "platform" },
    create: {
      id: "platform",
      registrationNoticeEnabled: true,
      registrationNoticeMode: "consent",
      registrationNoticeVersion: 41,
      registrationNoticeTitleEn: "Beta terms",
      registrationNoticeTitleZh: "Beta terms zh",
      registrationNoticeBodyEn: "Testing only",
      registrationNoticeBodyZh: "Testing only zh"
    },
    update: {
      registrationNoticeEnabled: true,
      registrationNoticeMode: "consent",
      registrationNoticeVersion: 41,
      registrationNoticeTitleEn: "Beta terms",
      registrationNoticeTitleZh: "Beta terms zh",
      registrationNoticeBodyEn: "Testing only",
      registrationNoticeBodyZh: "Testing only zh"
    }
  });
  const codes = ["unchecked", "stale", "accepted"].map(
    (label) => `${label}-${randomUUID().replace(/-/g, "")}`
  );
  await prisma.invite.createMany({
    data: codes.map((code) => ({ code, issuedById: issuer.id }))
  });

  let acceptedUserId: string | null = null;
  try {
    const unchecked = await redeemInvite(
      codes[0],
      account(`unchecked-${suffix}`),
      { accepted: false, noticeVersion: 41, locale: "en" }
    );
    assert.deepEqual(unchecked, { ok: false, error: "consentRequired" });

    const stale = await redeemInvite(codes[1], account(`stale-${suffix}`), {
      accepted: true,
      noticeVersion: 40,
      locale: "zh"
    });
    assert.deepEqual(stale, { ok: false, error: "noticeChanged" });

    const accepted = await redeemInvite(codes[2], account(`accepted-${suffix}`), {
      accepted: true,
      noticeVersion: 41,
      locale: "zh"
    });
    assert.equal(accepted.ok, true);
    if (!accepted.ok) throw new Error("consent redemption unexpectedly failed");
    acceptedUserId = accepted.user.id;
    const redeemed = await prisma.invite.findUniqueOrThrow({ where: { code: codes[2] } });
    assert.equal(redeemed.consentNoticeVersion, 41);
    assert.equal(redeemed.consentLocale, "zh");
    assert.ok(redeemed.consentAcceptedAt);
    assert.equal(redeemed.consentNoticeHash, registrationNoticeHash(notice));
    console.log("PASS  consent is versioned, server-validated and atomically recorded");
  } finally {
    if (acceptedUserId) {
      await prisma.user.delete({ where: { id: acceptedUserId } }).catch(() => undefined);
    }
    await prisma.user.delete({ where: { id: issuer.id } }).catch(() => undefined);
    if (previous) {
      await prisma.platformSettings.update({
        where: { id: "platform" },
        data: {
          registrationNoticeEnabled: previous.registrationNoticeEnabled,
          registrationNoticeDelaySeconds: previous.registrationNoticeDelaySeconds,
          registrationNoticeTitleEn: previous.registrationNoticeTitleEn,
          registrationNoticeTitleZh: previous.registrationNoticeTitleZh,
          registrationNoticeBodyEn: previous.registrationNoticeBodyEn,
          registrationNoticeBodyZh: previous.registrationNoticeBodyZh,
          registrationNoticeMode: previous.registrationNoticeMode,
          registrationNoticeVersion: previous.registrationNoticeVersion
        }
      });
    } else {
      await prisma.platformSettings.delete({ where: { id: "platform" } }).catch(() => undefined);
    }
  }
}

async function testLotteryAvailability() {
  const suffix = randomUUID().slice(0, 8);
  const owner = await prisma.user.create({
    data: {
      username: `lottery-owner-${suffix}`,
      passwordHash: "test-only-password-hash",
      settings: { create: { lotteryEnabled: true } }
    }
  });
  try {
    const bookingEvent = await prisma.bookingEvent.create({
      data: {
        ownerId: owner.id,
        token: randomUUID().replace(/-/g, ""),
        titleEn: "Security draw",
        titleZh: "Security draw",
        date: new Date(Date.now() + 86_400_000),
        lotteryEnabled: true
      }
    });
    const draw = await prisma.lotteryDraw.create({
      data: {
        bookingEventId: bookingEvent.id,
        token: randomUUID().replace(/-/g, ""),
        prizes: { create: { name: "Prize", quantity: 4, weight: 1 } }
      }
    });
    const displayToken = await uniqueEntryToken(draw.id);
    assert.equal(displayToken.length, 8, "new display tokens must contain eight characters");

    const makeEntry = (label: string) =>
      prisma.lotteryEntry.create({
        data: {
          drawId: draw.id,
          name: label,
          contactMethod: "wechat",
          contactValue: `${label}-id`,
          token: `${label.slice(0, 2).toUpperCase()}${randomUUID().replace(/-/g, "").slice(0, 6)}`
        }
      });

    const enabled = await makeEntry("enabled");
    assert.equal((await spinForEntry(enabled.id, draw.id, true)).ok, true);

    const siteOff = await makeEntry("site-off");
    await prisma.siteSettings.update({
      where: { ownerId: owner.id },
      data: { lotteryEnabled: false }
    });
    assert.deepEqual(await spinForEntry(siteOff.id, draw.id, true), {
      ok: false,
      error: "not_found"
    });

    await prisma.siteSettings.update({
      where: { ownerId: owner.id },
      data: { lotteryEnabled: true }
    });
    const eventOff = await makeEntry("event-off");
    await prisma.bookingEvent.update({
      where: { id: bookingEvent.id },
      data: { lotteryEnabled: false }
    });
    assert.deepEqual(await spinForEntry(eventOff.id, draw.id, true), {
      ok: false,
      error: "not_found"
    });

    await prisma.bookingEvent.update({
      where: { id: bookingEvent.id },
      data: { lotteryEnabled: true }
    });
    const suspended = await makeEntry("suspended");
    await prisma.user.update({ where: { id: owner.id }, data: { status: "suspended" } });
    assert.deepEqual(await spinForEntry(suspended.id, draw.id, true), {
      ok: false,
      error: "not_found"
    });
    console.log("PASS  lottery spin rechecks owner, site and event availability under lock");
  } finally {
    await prisma.user.delete({ where: { id: owner.id } }).catch(() => undefined);
  }
}

async function testHomePhotoWeightDefault() {
  const suffix = randomUUID().slice(0, 8);
  const owner = await prisma.user.create({
    data: {
      username: `home-weight-owner-${suffix}`,
      passwordHash: "test-only-password-hash"
    }
  });
  try {
    const event = await prisma.event.create({
      data: {
        ownerId: owner.id,
        slug: `home-weight-${suffix}`,
        titleEn: "Weight test",
        titleZh: "Weight test"
      }
    });
    await prisma.photo.createMany({
      data: Array.from({ length: 30 }, (_, index) => ({
        eventId: event.id,
        filename: `weight-${index}.jpg`,
        originalName: `weight-${index}.jpg`,
        width: 1200,
        height: 800
      }))
    });
    const photos = await prisma.photo.findMany({
      where: { eventId: event.id },
      select: { id: true, homeWeight: true }
    });
    assert.equal(photos.length, 30);
    assert.ok(
      photos.every(({ homeWeight }) => homeWeight >= 1 && homeWeight <= 5),
      "database-generated homepage weights must stay within 1-5"
    );
    assert.ok(
      new Set(photos.map(({ homeWeight }) => homeWeight)).size > 1,
      "database-generated homepage weights should vary across new photos"
    );
    await assert.rejects(
      prisma.photo.update({
        where: { id: photos[0].id },
        data: { homeWeight: 6 }
      }),
      "the database must reject homepage weights outside 1-5"
    );
    console.log("PASS  homepage photo weights are random and constrained to 1-5");
  } finally {
    await prisma.user.delete({ where: { id: owner.id } }).catch(() => undefined);
  }
}

async function testHomePhotoStreamPagination() {
  const suffix = randomUUID().slice(0, 8);
  const owner = await prisma.user.create({
    data: {
      username: `home-stream-owner-${suffix}`,
      passwordHash: "test-only-password-hash"
    }
  });

  try {
    const [newerEvent, olderEvent, privateEvent] = await Promise.all([
      prisma.event.create({
        data: {
          ownerId: owner.id,
          slug: `newer-${suffix}`,
          titleEn: "Newer album",
          titleZh: "较新的相册",
          published: true,
          dateStart: new Date("2026-07-02T00:00:00.000Z")
        }
      }),
      prisma.event.create({
        data: {
          ownerId: owner.id,
          slug: `older-${suffix}`,
          titleEn: "Older album",
          titleZh: "较早的相册",
          published: true,
          dateStart: new Date("2026-07-01T00:00:00.000Z")
        }
      }),
      prisma.event.create({
        data: {
          ownerId: owner.id,
          slug: `private-${suffix}`,
          titleEn: "Private album",
          titleZh: "未公开相册",
          published: false
        }
      })
    ]);

    const photoData = (eventId: string, prefix: string, count: number) =>
      Array.from({ length: count }, (_, index) => ({
        eventId,
        filename: `${prefix}-${index}.jpg`,
        originalName: `${prefix}-${index}.jpg`,
        width: 1200,
        height: 800,
        sortOrder: index
      }));

    await prisma.photo.createMany({
      data: [
        ...photoData(newerEvent.id, "newer", 16),
        ...photoData(olderEvent.id, "older", 15),
        ...photoData(privateEvent.id, "private", 1),
        {
          ...photoData(newerEvent.id, "held", 1)[0],
          moderationStatus: "queued"
        }
      ]
    });

    let cursor: string | null = null;
    let merged: StreamEvent[] = [];
    let pages = 0;
    do {
      const page = await getHomePhotoStreamPage({
        ownerId: owner.id,
        locale: "en",
        cursor,
        pageSize: 7
      });
      merged = mergeStreamEvents(merged, page.events);
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor);

    const photoIds = merged.flatMap((event) =>
      event.photos.map((photo) => photo.id)
    );
    assert.equal(pages, 5, "31 public photos should require five seven-photo pages");
    assert.equal(merged.length, 2, "album continuations must merge into two sections");
    assert.equal(photoIds.length, 31, "every public photo should eventually load");
    assert.equal(new Set(photoIds).size, 31, "cursor pages must not duplicate photos");
    assert.deepEqual(
      merged.map((event) => [event.title, event.photos.length]),
      [
        ["Newer album", 16],
        ["Older album", 15]
      ],
      "the stream should preserve album recency and gallery order"
    );
    console.log("PASS  homepage stream paginates every public photo without duplicates");
  } finally {
    await prisma.user.delete({ where: { id: owner.id } }).catch(() => undefined);
  }
}

async function main() {
  await testRegistrationConsent();
  await testLotteryAvailability();
  await testHomePhotoWeightDefault();
  await testHomePhotoStreamPagination();
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
