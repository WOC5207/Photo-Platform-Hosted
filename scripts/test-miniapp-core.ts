/**
 * Mini-program security and ownership acceptance tests.
 *
 * Run against a disposable, migrated Postgres database:
 *   npx tsx --env-file-if-exists=.env --conditions=react-server scripts/test-miniapp-core.ts
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { reserveSlot } from "../src/lib/booking";
import {
  authenticateMiniProgramRequest,
  createWeChatSession,
  hashMiniProgramToken
} from "../src/lib/miniapp/auth";
import {
  cancelMiniProgramBooking,
  createMiniProgramLotteryEntry,
  deleteMiniProgramIdentity,
  importMiniProgramBooking,
  listMiniProgramBookings
} from "../src/lib/miniapp/services";

process.env.MINIAPP_API_ENABLED = "true";
process.env.WECHAT_MINIAPP_APP_ID = "test-miniapp";
process.env.WECHAT_MINIAPP_APP_SECRET = "test-only-secret";
process.env.MINIAPP_SESSION_TTL_DAYS = "7";
process.env.APP_BASE_URL ||= "https://photos.example.test";
process.env.SESSION_SECRET ||=
  "miniapp-test-session-secret-with-at-least-thirty-two-characters";

const prisma = new PrismaClient();
const originalFetch = globalThis.fetch;
const token = () => randomUUID().replace(/-/g, "");

function mockCodeExchange(openId: string) {
  globalThis.fetch = async () =>
    Response.json({
      openid: openId,
      session_key: "must-never-be-persisted-or-returned"
    });
}

async function testSessions() {
  const openId = `session-${token()}`;
  mockCodeExchange(openId);
  const issued = [];
  for (let i = 0; i < 6; i++) {
    issued.push(await createWeChatSession(`code-${i}`));
  }
  const identityId = issued[0].identityId;

  const stored = await prisma.miniProgramSession.findMany({
    where: { identityId },
    select: { id: true, tokenHash: true }
  });
  assert.equal(stored.length, 5, "an identity must retain at most five sessions");
  assert.ok(
    stored.every((session) => /^[a-f0-9]{64}$/.test(session.tokenHash)),
    "only SHA-256 token digests are stored"
  );

  const surviving = issued.find((candidate) =>
    stored.some(
      (session) =>
        session.tokenHash === hashMiniProgramToken(candidate.token)
    )
  );
  assert.ok(surviving, "at least one issued token must remain usable");

  const valid = await authenticateMiniProgramRequest(
    new Request("https://example.test", {
      headers: { authorization: `Bearer ${surviving.token}` }
    })
  );
  assert.equal(valid?.identityId, identityId);

  const forged = await authenticateMiniProgramRequest(
    new Request("https://example.test", {
      headers: { authorization: `Bearer ${"A".repeat(43)}` }
    })
  );
  assert.equal(forged, null, "a forged opaque token must not authenticate");

  await prisma.miniProgramSession.update({
    where: { tokenHash: hashMiniProgramToken(surviving.token) },
    data: { expiresAt: new Date(Date.now() - 1) }
  });
  const expired = await authenticateMiniProgramRequest(
    new Request("https://example.test", {
      headers: { authorization: `Bearer ${surviving.token}` }
    })
  );
  assert.equal(expired, null, "an expired session must not authenticate");

  await prisma.weChatIdentity.delete({ where: { id: identityId } });
  console.log("PASS  forged/expired sessions fail and only five rows are retained");
}

async function makeFixture() {
  const suffix = randomUUID().slice(0, 8);
  const owner = await prisma.user.create({
    data: {
      username: `miniapp-owner-${suffix}`,
      passwordHash: "test-only-hash",
      settings: {
        create: {
          miniappEnabled: true,
          bookingEnabled: true,
          lotteryEnabled: true,
          timeZone: "UTC"
        }
      }
    }
  });
  const future = new Date(Date.UTC(2035, 0, 10, 12));
  const event = await prisma.bookingEvent.create({
    data: {
      ownerId: owner.id,
      token: token(),
      titleEn: "Miniapp test",
      titleZh: "Miniapp test",
      date: future,
      open: true,
      lotteryEnabled: true,
      days: { create: { date: future } }
    },
    include: { days: true }
  });
  const slot = await prisma.timeSlot.create({
    data: {
      bookingEventId: event.id,
      bookingDayId: event.days[0].id,
      startTime: future,
      endTime: new Date(future.getTime() + 3_600_000),
      capacity: 20
    }
  });
  const draw = await prisma.lotteryDraw.create({
    data: {
      bookingEventId: event.id,
      token: token(),
      open: true,
      prizes: { create: { name: "Prize", quantity: 10, weight: 1 } }
    }
  });
  const [identityA, identityB, identityDelete] = await Promise.all(
    ["a", "b", "delete"].map((label) =>
      prisma.weChatIdentity.create({
        data: {
          appId: "test-miniapp",
          openId: `${label}-${token()}`
        }
      })
    )
  );
  return {
    owner,
    event,
    slot,
    draw,
    identityA,
    identityB,
    identityDelete
  };
}

async function testLockedBookingGate(
  fixture: Awaited<ReturnType<typeof makeFixture>>
) {
  const cancelToken = token();
  await prisma.siteSettings.update({
    where: { ownerId: fixture.owner.id },
    data: { bookingEnabled: false }
  });
  try {
    const result = await reserveSlot(fixture.slot.id, {
      name: "Must stay closed",
      subject: "",
      contactMethod: "",
      contactValue: "private-contact",
      email: "",
      notes: "",
      cancelToken,
      locale: "en",
      wechatIdentityId: fixture.identityA.id,
      requireMiniappAvailability: true
    });
    assert.deepEqual(
      result,
      { ok: false, error: "closed" },
      "the locked write boundary must recheck bookingEnabled"
    );
    assert.equal(
      await prisma.booking.count({ where: { cancelToken } }),
      0,
      "a disabled tenant must not receive a miniapp booking"
    );
  } finally {
    await prisma.siteSettings.update({
      where: { ownerId: fixture.owner.id },
      data: { bookingEnabled: true }
    });
  }
  console.log("PASS  bookingEnabled is rechecked at the locked insert boundary");
}

async function testOwnershipAndImport(
  fixture: Awaited<ReturnType<typeof makeFixture>>
) {
  const cancelToken = token();
  const booking = await prisma.booking.create({
    data: {
      timeSlotId: fixture.slot.id,
      wechatIdentityId: fixture.identityA.id,
      name: "Identity A",
      contactValue: "private-contact",
      cancelToken
    }
  });

  const own = await listMiniProgramBookings(fixture.identityA.id);
  assert.equal(own.ok && own.data.items.length, 1);
  const other = await listMiniProgramBookings(fixture.identityB.id);
  assert.equal(other.ok && other.data.items.length, 0);

  const forbiddenCancel = await cancelMiniProgramBooking(
    fixture.identityB.id,
    booking.id,
    `ip-${token()}`
  );
  assert.deepEqual(forbiddenCancel, { ok: false, error: "notFound" });
  assert.equal(
    (
      await prisma.booking.findUniqueOrThrow({
        where: { id: booking.id },
        select: { status: true }
      })
    ).status,
    "confirmed"
  );

  const conflictingImport = await importMiniProgramBooking(
    fixture.identityB.id,
    cancelToken,
    `ip-${token()}`
  );
  assert.deepEqual(conflictingImport, { ok: false, error: "conflict" });

  await prisma.booking.createMany({
    data: Array.from({ length: 50 }, (_, index) => ({
      timeSlotId: fixture.slot.id,
      wechatIdentityId: fixture.identityA.id,
      name: `Paged booking ${index}`,
      cancelToken: token()
    }))
  });
  const firstPage = await listMiniProgramBookings(fixture.identityA.id, {
    limit: 500
  });
  if (!firstPage.ok) throw new Error("first booking page unexpectedly failed");
  assert.equal(
    firstPage.data.items.length,
    50,
    "the service must enforce the 50-row hard cap"
  );
  if (!firstPage.data.nextCursor) {
    throw new Error("a truncated booking page must return nextCursor");
  }
  const firstPageIds = new Set(
    firstPage.data.items.map((item) => item.id)
  );
  const secondPage = await listMiniProgramBookings(fixture.identityA.id, {
    cursor: firstPage.data.nextCursor,
    limit: 50
  });
  if (!secondPage.ok) {
    throw new Error("second booking page unexpectedly failed");
  }
  assert.equal(secondPage.data.items.length, 1);
  assert.equal(secondPage.data.nextCursor, null);
  assert.equal(
    firstPageIds.has(secondPage.data.items[0].id),
    false,
    "createdAt/id cursor pages must not overlap"
  );
  console.log(
    "PASS  booking reads/cancels are identity-scoped, imports conflict, and pages cap at 50"
  );
}

async function testLotteryIdentityUniqueness(
  fixture: Awaited<ReturnType<typeof makeFixture>>
) {
  const results = await Promise.all([
    createMiniProgramLotteryEntry(
      fixture.identityB.id,
      fixture.draw.token,
      { name: "same identity", subject: "", contactValue: `one-${token()}` },
      `ip-${token()}`
    ),
    createMiniProgramLotteryEntry(
      fixture.identityB.id,
      fixture.draw.token,
      { name: "same identity", subject: "", contactValue: `two-${token()}` },
      `ip-${token()}`
    )
  ]);
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(
    results.filter(
      (result) => !result.ok && result.error === "duplicate"
    ).length,
    1
  );
  assert.equal(
    await prisma.lotteryEntry.count({
      where: {
        drawId: fixture.draw.id,
        wechatIdentityId: fixture.identityB.id
      }
    }),
    1
  );
  console.log("PASS  concurrent self-entry leaves one identity row per draw");
}

async function testDeleteMe(
  fixture: Awaited<ReturnType<typeof makeFixture>>
) {
  const booking = await prisma.booking.create({
    data: {
      timeSlotId: fixture.slot.id,
      wechatIdentityId: fixture.identityDelete.id,
      name: "Delete Me",
      subject: "private subject",
      contactMethod: "wechat",
      contactValue: "private-contact",
      email: "private@example.test",
      notes: "private notes",
      cancelToken: token()
    }
  });
  const entry = await prisma.lotteryEntry.create({
    data: {
      drawId: fixture.draw.id,
      wechatIdentityId: fixture.identityDelete.id,
      name: "Delete Me",
      subject: "private subject",
      contactValue: "private-contact",
      token: token().slice(0, 8).toUpperCase()
    }
  });
  await prisma.miniProgramSession.create({
    data: {
      identityId: fixture.identityDelete.id,
      tokenHash: hashMiniProgramToken(
        Buffer.from(randomUUID()).toString("base64url").slice(0, 43)
      ),
      expiresAt: new Date(Date.now() + 86_400_000)
    }
  });

  const deleted = await deleteMiniProgramIdentity(
    fixture.identityDelete.id,
    `ip-${token()}`
  );
  assert.deepEqual(deleted, { ok: true, data: { deleted: true } });
  assert.equal(
    await prisma.weChatIdentity.findUnique({
      where: { id: fixture.identityDelete.id }
    }),
    null
  );
  assert.equal(
    await prisma.miniProgramSession.count({
      where: { identityId: fixture.identityDelete.id }
    }),
    0
  );

  const anonymizedBooking = await prisma.booking.findUniqueOrThrow({
    where: { id: booking.id }
  });
  assert.equal(anonymizedBooking.status, "cancelled");
  assert.equal(anonymizedBooking.wechatIdentityId, null);
  assert.equal(anonymizedBooking.contactValue, "");
  assert.equal(anonymizedBooking.email, "");
  assert.equal(anonymizedBooking.notes, "");

  const anonymizedEntry = await prisma.lotteryEntry.findUniqueOrThrow({
    where: { id: entry.id }
  });
  assert.equal(anonymizedEntry.wechatIdentityId, null);
  assert.equal(anonymizedEntry.contactValue, "");
  assert.equal(anonymizedEntry.subject, "");
  console.log("PASS  DELETE /me cancels future work and removes identity/session PII");
}

async function main() {
  await testSessions();
  const fixture = await makeFixture();
  try {
    await testLockedBookingGate(fixture);
    await testOwnershipAndImport(fixture);
    await testLotteryIdentityUniqueness(fixture);
    await testDeleteMe(fixture);
  } finally {
    await prisma.user
      .delete({ where: { id: fixture.owner.id } })
      .catch(() => undefined);
    await prisma.weChatIdentity.deleteMany({
      where: {
        id: {
          in: [
            fixture.identityA.id,
            fixture.identityB.id,
            fixture.identityDelete.id
          ]
        }
      }
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    globalThis.fetch = originalFetch;
    await prisma.$disconnect();
  });
