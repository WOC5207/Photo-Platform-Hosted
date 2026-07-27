import "server-only";
import { Prisma } from "@prisma/client";
import { createPublicBooking } from "@/lib/publicBookingService";
import { cancelPublicBookingForIdentity } from "@/lib/publicBookingService";
import { prisma } from "@/lib/db";
import { decodeCursor, encodeCursor } from "@/lib/miniapp/cursor";
import { invalidCursor } from "@/lib/miniapp/http";
import { formatDate } from "@/lib/datetime";
import {
  localized,
  toBookingDto,
  type BookingDto,
  type LocalizedText
} from "@/lib/miniapp/dto";
import { publicPhotoWhere } from "@/lib/photoVisibility";
import {
  createPublicLotteryEntry,
  normalizeLotteryIdentity,
  recoverPublicLotteryEntry,
  spinPublicLotteryEntry
} from "@/lib/publicLotteryEntryService";
import { findAvailablePublicDraw } from "@/lib/publicLottery";
import { rateLimit } from "@/lib/rate-limit";
import {
  DEFAULT_TIME_ZONE,
  isNaiveDateTimePast
} from "@/lib/timeZone";

export type MiniProgramServiceError =
  | "notFound"
  | "closed"
  | "slotFull"
  | "slotUnavailable"
  | "duplicate"
  | "alreadySpun"
  | "noPrizesLeft"
  | "rateLimited"
  | "conflict";

export type MiniProgramServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: MiniProgramServiceError };

interface WriteLimit {
  limit: number;
  windowMs: number;
}

/**
 * Every authenticated write consumes both an identity bucket and an IP bucket.
 * The in-process limiter is intentional for the current single-NAS deployment.
 */
function miniProgramWriteAllowed(
  operation: string,
  identityId: string,
  ip: string,
  limit: WriteLimit
): boolean {
  const identityAllowed = rateLimit(
    `miniapp:${operation}:identity:${identityId}`,
    limit
  );
  const ipAllowed = rateLimit(
    `miniapp:${operation}:ip:${ip || "unknown"}`,
    limit
  );
  return identityAllowed && ipAllowed;
}

export interface MiniProgramBookingInput {
  slotId: string;
  name: string;
  subject: string;
  contactValue: string;
  email: string;
  notes: string;
  locale: string;
}

export type MiniProgramBookingData = BookingDto;

const miniProgramBookingInclude = {
  timeSlot: {
    include: {
      bookingEvent: {
        include: {
          owner: {
            select: {
              settings: {
                select: {
                  timeZone: true,
                  bookingPriceEnabled: true
                }
              }
            }
          }
        }
      }
    }
  },
  lotteryEntry: {
    include: { wonPrize: { select: { name: true } } }
  }
} satisfies Prisma.BookingInclude;

type MiniProgramBooking = Prisma.BookingGetPayload<{
  include: typeof miniProgramBookingInclude;
}>;

function bookingData(booking: MiniProgramBooking): MiniProgramBookingData {
  return toBookingDto(booking);
}

async function findMiniProgramBooking(
  identityId: string,
  bookingId: string
): Promise<MiniProgramBookingData | null> {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, wechatIdentityId: identityId },
    include: miniProgramBookingInclude
  });
  return booking ? bookingData(booking) : null;
}

export async function createMiniProgramBooking(
  identityId: string,
  eventToken: string,
  input: MiniProgramBookingInput,
  ip: string
): Promise<MiniProgramServiceResult<MiniProgramBookingData>> {
  if (
    !miniProgramWriteAllowed(`booking:create:${eventToken}`, identityId, ip, {
      limit: 30,
      windowMs: 60 * 60 * 1000
    })
  ) {
    return { ok: false, error: "rateLimited" };
  }

  const event = await prisma.bookingEvent.findUnique({
    where: { token: eventToken },
    select: {
      id: true,
      open: true,
      owner: {
        select: {
          status: true,
          settings: {
            select: { miniappEnabled: true, bookingEnabled: true }
          }
        }
      }
    }
  });
  if (
    !event ||
    event.owner.status !== "active" ||
    !event.owner.settings?.miniappEnabled
  ) {
    return { ok: false, error: "notFound" };
  }
  if (!event.open || !event.owner.settings.bookingEnabled) {
    return { ok: false, error: "closed" };
  }

  const slot = await prisma.timeSlot.findFirst({
    where: { id: input.slotId, bookingEventId: event.id },
    select: { id: true }
  });
  if (!slot) return { ok: false, error: "slotUnavailable" };

  const created = await createPublicBooking({
    ...input,
    wechatIdentityId: identityId,
    requireMiniappAvailability: true
  });
  if (!created.ok) return created;

  const data = await findMiniProgramBooking(
    identityId,
    created.data.bookingId
  );
  return data
    ? { ok: true, data }
    : { ok: false, error: "notFound" };
}

export interface MiniProgramBookingListInput {
  cursor?: string | null;
  limit?: number;
}

function miniProgramBookingCursor(
  cursor: string | null | undefined
): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  const position = decodeCursor(cursor, "me-bookings");
  if (
    !position ||
    position.length !== 2 ||
    typeof position[0] !== "string" ||
    typeof position[1] !== "string" ||
    !position[1]
  ) {
    return invalidCursor();
  }
  const createdAt = new Date(position[0]);
  if (Number.isNaN(createdAt.getTime())) return invalidCursor();
  return { createdAt, id: position[1] };
}

export async function listMiniProgramBookings(
  identityId: string,
  input: MiniProgramBookingListInput = {}
): Promise<
  MiniProgramServiceResult<{
    items: MiniProgramBookingData[];
    nextCursor: string | null;
  }>
> {
  const cursor = miniProgramBookingCursor(input.cursor);
  const requestedLimit = input.limit ?? 20;
  const limit =
    Number.isInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 50)
      : 20;
  const bookings = await prisma.booking.findMany({
    where: {
      wechatIdentityId: identityId,
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              {
                createdAt: cursor.createdAt,
                id: { lt: cursor.id }
              }
            ]
          }
        : {})
    },
    include: miniProgramBookingInclude,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1
  });
  const hasMore = bookings.length > limit;
  const page = hasMore ? bookings.slice(0, limit) : bookings;
  const last = page.at(-1);
  return {
    ok: true,
    data: {
      items: page.map(bookingData),
      nextCursor:
        hasMore && last
          ? encodeCursor("me-bookings", [
              last.createdAt.toISOString(),
              last.id
            ])
          : null
    }
  };
}

export async function cancelMiniProgramBooking(
  identityId: string,
  bookingId: string,
  ip: string
): Promise<MiniProgramServiceResult<MiniProgramBookingData>> {
  if (
    !miniProgramWriteAllowed("booking:cancel", identityId, ip, {
      limit: 30,
      windowMs: 60 * 60 * 1000
    })
  ) {
    return { ok: false, error: "rateLimited" };
  }
  const cancelled = await cancelPublicBookingForIdentity(
    identityId,
    bookingId
  );
  if (!cancelled.ok) return cancelled;
  const data = await findMiniProgramBooking(identityId, bookingId);
  return data
    ? { ok: true, data }
    : { ok: false, error: "notFound" };
}

export async function importMiniProgramBooking(
  identityId: string,
  cancelToken: string,
  ip: string
): Promise<MiniProgramServiceResult<MiniProgramBookingData>> {
  if (
    !miniProgramWriteAllowed("booking:import", identityId, ip, {
      limit: 15,
      windowMs: 60 * 60 * 1000
    })
  ) {
    return { ok: false, error: "rateLimited" };
  }
  if (!/^[a-z0-9]{16,100}$/.test(cancelToken)) {
    return { ok: false, error: "notFound" };
  }

  const result = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Booking" WHERE "cancelToken" = ${cancelToken} FOR UPDATE
    `;
    const bookingId = rows[0]?.id;
    if (!bookingId) return { ok: false, error: "notFound" } as const;

    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: { lotteryEntry: true }
    });
    if (!booking) return { ok: false, error: "notFound" } as const;
    if (
      booking.wechatIdentityId &&
      booking.wechatIdentityId !== identityId
    ) {
      return { ok: false, error: "conflict" } as const;
    }
    if (
      booking.lotteryEntry?.wechatIdentityId &&
      booking.lotteryEntry.wechatIdentityId !== identityId
    ) {
      return { ok: false, error: "conflict" } as const;
    }

    if (booking.lotteryEntry) {
      const existingForIdentity = await tx.lotteryEntry.findFirst({
        where: {
          drawId: booking.lotteryEntry.drawId,
          wechatIdentityId: identityId,
          id: { not: booking.lotteryEntry.id }
        },
        select: { id: true }
      });
      if (existingForIdentity) {
        return { ok: false, error: "conflict" } as const;
      }
    }

    await tx.booking.update({
      where: { id: booking.id },
      data: { wechatIdentityId: identityId }
    });
    if (booking.lotteryEntry) {
      await tx.lotteryEntry.update({
        where: { id: booking.lotteryEntry.id },
        data: { wechatIdentityId: identityId }
      });
    }
    return { ok: true, bookingId: booking.id } as const;
  });

  if (!result.ok) return result;
  const data = await findMiniProgramBooking(identityId, result.bookingId);
  return data
    ? { ok: true, data }
    : { ok: false, error: "notFound" };
}

export interface MiniProgramLotteryEntryData {
  id: string;
  token: string;
  wonPrize: { id: string; name: string } | null;
}

export interface MiniProgramLotteryData {
  token: string;
  open: boolean;
  event: {
    title: LocalizedText;
    description: LocalizedText;
    location: string;
    date: string;
    timeZone: string;
  };
  prizes: Array<{
    id: string;
    name: string;
    quantity: number;
    remaining: number;
    weight: number;
  }>;
  entry: MiniProgramLotteryEntryData | null;
}

export async function readMiniProgramLottery(
  drawToken: string,
  identityId?: string
): Promise<MiniProgramServiceResult<MiniProgramLotteryData>> {
  const draw = await findAvailablePublicDraw(drawToken);
  if (!draw || !draw.bookingEvent.owner.settings?.miniappEnabled) {
    return { ok: false, error: "notFound" };
  }

  const [prizes, entry] = await Promise.all([
    prisma.lotteryPrize.findMany({
      where: { drawId: draw.id },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      include: { _count: { select: { winners: true } } }
    }),
    identityId
      ? prisma.lotteryEntry.findFirst({
          where: { drawId: draw.id, wechatIdentityId: identityId },
          select: {
            id: true,
            token: true,
            wonPrize: { select: { id: true, name: true } }
          }
        })
      : null
  ]);

  return {
    ok: true,
    data: {
      token: draw.token,
      open: draw.open,
      event: {
        title: localized(draw.bookingEvent.titleEn, draw.bookingEvent.titleZh),
        description: localized(
          draw.bookingEvent.descriptionEn,
          draw.bookingEvent.descriptionZh
        ),
        location: draw.bookingEvent.location,
        date: formatDate(draw.bookingEvent.date),
        timeZone:
          draw.bookingEvent.owner.settings?.timeZone ?? DEFAULT_TIME_ZONE
      },
      prizes: prizes.map((prize) => ({
        id: prize.id,
        name: prize.name,
        quantity: prize.quantity,
        remaining: Math.max(0, prize.quantity - prize._count.winners),
        weight: prize.weight
      })),
      entry: entry
        ? {
            id: entry.id,
            token: entry.token,
            wonPrize: entry.wonPrize
          }
        : null
    }
  };
}

export interface MiniProgramLotteryEntryInput {
  name: string;
  subject?: string;
  contactValue: string;
}

export async function createMiniProgramLotteryEntry(
  identityId: string,
  drawToken: string,
  input: MiniProgramLotteryEntryInput,
  ip: string
): Promise<MiniProgramServiceResult<MiniProgramLotteryEntryData>> {
  if (
    !miniProgramWriteAllowed(`lottery:enter:${drawToken}`, identityId, ip, {
      limit: 30,
      windowMs: 60 * 60 * 1000
    })
  ) {
    return { ok: false, error: "rateLimited" };
  }
  const created = await createPublicLotteryEntry(drawToken, input, {
    wechatIdentityId: identityId,
    requireMiniappEnabled: true
  });
  if (!created.ok) return created;
  return {
    ok: true,
    data: { id: created.data.id, token: created.data.token, wonPrize: null }
  };
}

export async function spinMiniProgramLotteryEntry(
  identityId: string,
  entryId: string,
  ip: string
): Promise<
  MiniProgramServiceResult<{
    entryId: string;
    prize: { id: string; name: string };
  }>
> {
  if (
    !miniProgramWriteAllowed("lottery:spin", identityId, ip, {
      limit: 20,
      windowMs: 60 * 60 * 1000
    })
  ) {
    return { ok: false, error: "rateLimited" };
  }
  const spun = await spinPublicLotteryEntry(entryId, {
    wechatIdentityId: identityId,
    requireMiniappEnabled: true
  });
  if (!spun.ok) return spun;
  return {
    ok: true,
    data: {
      entryId,
      prize: { id: spun.data.prizeId, name: spun.data.prizeName }
    }
  };
}

export interface MiniProgramLotteryImportInput {
  drawToken: string;
  entryToken: string;
  name: string;
  contactValue: string;
}

export async function importMiniProgramLotteryEntry(
  identityId: string,
  input: MiniProgramLotteryImportInput,
  ip: string
): Promise<MiniProgramServiceResult<MiniProgramLotteryEntryData>> {
  if (
    !miniProgramWriteAllowed("lottery:import", identityId, ip, {
      limit: 15,
      windowMs: 60 * 60 * 1000
    })
  ) {
    return { ok: false, error: "rateLimited" };
  }

  const recovered = await recoverPublicLotteryEntry(
    input.drawToken,
    input,
    true
  );
  if (!recovered.ok) return recovered;

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM "LotteryEntry"
        WHERE id = ${recovered.data.id}
        FOR UPDATE
      `;
      const entry = await tx.lotteryEntry.findUnique({
        where: { id: recovered.data.id },
        select: {
          id: true,
          drawId: true,
          token: true,
          wonPrize: { select: { id: true, name: true } },
          name: true,
          contactValue: true,
          wechatIdentityId: true
        }
      });
      if (
        !entry ||
        normalizeLotteryIdentity(entry.name) !==
          normalizeLotteryIdentity(input.name) ||
        normalizeLotteryIdentity(entry.contactValue) !==
          normalizeLotteryIdentity(input.contactValue)
      ) {
        return { ok: false, error: "notFound" } as const;
      }
      if (
        entry.wechatIdentityId &&
        entry.wechatIdentityId !== identityId
      ) {
        return { ok: false, error: "conflict" } as const;
      }
      const identityEntry = await tx.lotteryEntry.findFirst({
        where: {
          drawId: entry.drawId,
          wechatIdentityId: identityId,
          id: { not: entry.id }
        },
        select: { id: true }
      });
      if (identityEntry) {
        return { ok: false, error: "conflict" } as const;
      }
      await tx.lotteryEntry.update({
        where: { id: entry.id },
        data: { wechatIdentityId: identityId }
      });
      return {
        ok: true,
        data: {
          id: entry.id,
          token: entry.token,
          wonPrize: entry.wonPrize
        }
      } as const;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false, error: "conflict" };
    }
    throw error;
  }
}

export interface MiniProgramContentReportInput {
  reason: string;
  details: string;
}

export async function createMiniProgramContentReport(
  identityId: string,
  photoId: string,
  input: MiniProgramContentReportInput,
  ip: string
): Promise<
  MiniProgramServiceResult<{
    id: string;
    status: "pending";
    createdAt: string;
  }>
> {
  if (
    !miniProgramWriteAllowed("content:report", identityId, ip, {
      limit: 10,
      windowMs: 24 * 60 * 60 * 1000
    })
  ) {
    return { ok: false, error: "rateLimited" };
  }

  const photo = await prisma.photo.findFirst({
    where: {
      id: photoId,
      ...publicPhotoWhere,
      event: {
        published: true,
        owner: {
          status: "active",
          settings: { is: { miniappEnabled: true } }
        }
      }
    },
    select: { id: true }
  });
  if (!photo) return { ok: false, error: "notFound" };

  const report = await prisma.contentReport.create({
    data: {
      photoId: photo.id,
      wechatIdentityId: identityId,
      reason: input.reason,
      details: input.details
    },
    select: { id: true, createdAt: true }
  });
  return {
    ok: true,
    data: {
      id: report.id,
      status: "pending",
      createdAt: report.createdAt.toISOString()
    }
  };
}

export interface DeleteMiniProgramIdentityData {
  deleted: true;
}

export async function deleteMiniProgramIdentity(
  identityId: string,
  ip = "unknown"
): Promise<MiniProgramServiceResult<DeleteMiniProgramIdentityData>> {
  if (
    !miniProgramWriteAllowed("identity:delete", identityId, ip, {
      limit: 5,
      windowMs: 24 * 60 * 60 * 1000
    })
  ) {
    return { ok: false, error: "rateLimited" };
  }

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT id FROM "WeChatIdentity" WHERE id = ${identityId} FOR UPDATE
    `;
    const identity = await tx.weChatIdentity.findUnique({
      where: { id: identityId },
      select: { id: true }
    });
    if (!identity) return { ok: false, error: "notFound" } as const;

    const bookings = await tx.booking.findMany({
      where: { wechatIdentityId: identityId },
      select: {
        id: true,
        status: true,
        timeSlot: {
          select: {
            startTime: true,
            bookingEvent: {
              select: {
                owner: {
                  select: {
                    settings: { select: { timeZone: true } }
                  }
                }
              }
            }
          }
        }
      }
    });
    const futureConfirmedIds = bookings
      .filter((booking) => {
        const zone =
          booking.timeSlot.bookingEvent.owner.settings?.timeZone ??
          DEFAULT_TIME_ZONE;
        return (
          booking.status === "confirmed" &&
          !isNaiveDateTimePast(booking.timeSlot.startTime, zone)
        );
      })
      .map((booking) => booking.id);

    if (bookings.length > 0) {
      await tx.booking.updateMany({
        where: { id: { in: bookings.map((booking) => booking.id) } },
        data: {
          name: "Deleted mini-program user",
          subject: "",
          contactMethod: "",
          contactValue: "",
          email: "",
          notes: ""
        }
      });
    }
    if (futureConfirmedIds.length > 0) {
      await tx.booking.updateMany({
        where: { id: { in: futureConfirmedIds }, status: "confirmed" },
        data: { status: "cancelled" }
      });
    }

    const lotteryEntries = await tx.lotteryEntry.findMany({
      where: { wechatIdentityId: identityId },
      select: { id: true }
    });
    if (lotteryEntries.length > 0) {
      await tx.lotteryEntry.updateMany({
        where: { id: { in: lotteryEntries.map((entry) => entry.id) } },
        data: {
          name: "Deleted mini-program user",
          subject: "",
          contactMethodId: null,
          contactMethod: "",
          contactValue: ""
        }
      });
    }

    // Mark first for an auditable lifecycle; the subsequent identity deletion
    // cascades the now-revoked opaque sessions and SET NULLs owned records.
    await tx.miniProgramSession.updateMany({
      where: { identityId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    await tx.weChatIdentity.delete({ where: { id: identityId } });

    return {
      ok: true,
      data: {
        deleted: true
      }
    } as const;
  });
}
