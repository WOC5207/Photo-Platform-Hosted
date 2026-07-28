import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { spinForEntry, uniqueEntryToken } from "@/lib/lottery";
import {
  findAvailablePublicDraw,
  lockAvailablePublicDrawByToken
} from "@/lib/publicLottery";

export interface PublicLotteryEntryInput {
  name: string;
  subject?: string;
  contactValue: string;
}

export interface PublicLotteryEntryData {
  id: string;
  token: string;
  wonPrizeId: string | null;
}

export type CreatePublicLotteryEntryResult =
  | { ok: true; data: PublicLotteryEntryData }
  | { ok: false; error: "closed" | "duplicate" };

export interface PublicLotteryEntryOptions {
  wechatIdentityId?: string;
  requireMiniappEnabled?: boolean;
}

export function normalizeLotteryIdentity(value: string): string {
  return value.trim().normalize("NFKC").toLocaleLowerCase("en");
}

/**
 * Shared Web/API self-entry transaction. The LotteryDraw row remains the
 * serialization point for the open gate and duplicate decision.
 */
export async function createPublicLotteryEntry(
  drawToken: string,
  input: PublicLotteryEntryInput,
  options: PublicLotteryEntryOptions = {}
): Promise<CreatePublicLotteryEntryResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      const draw = await lockAvailablePublicDrawByToken(tx, drawToken, true);
      if (
        !draw ||
        (options.requireMiniappEnabled &&
          !draw.bookingEvent.owner.settings?.miniappEnabled)
      ) {
        return { ok: false, error: "closed" } as const;
      }

      if (options.wechatIdentityId) {
        const identityEntry = await tx.lotteryEntry.findFirst({
          where: {
            drawId: draw.id,
            wechatIdentityId: options.wechatIdentityId
          },
          select: { id: true }
        });
        if (identityEntry) {
          return { ok: false, error: "duplicate" } as const;
        }
      }

      const normalizedValue = normalizeLotteryIdentity(input.contactValue);
      const possibleDuplicates = await tx.lotteryEntry.findMany({
        where: { drawId: draw.id, bookingId: null },
        select: { contactValue: true }
      });
      if (
        possibleDuplicates.some(
          (entry) =>
            normalizeLotteryIdentity(entry.contactValue) === normalizedValue
        )
      ) {
        return { ok: false, error: "duplicate" } as const;
      }

      const token = await uniqueEntryToken(draw.id, tx);
      const entry = await tx.lotteryEntry.create({
        data: {
          drawId: draw.id,
          name: input.name,
          subject: input.subject ?? "",
          contactValue: input.contactValue,
          token,
          wechatIdentityId: options.wechatIdentityId
        },
        select: { id: true, token: true, wonPrizeId: true }
      });
      return { ok: true, data: entry } as const;
    });
  } catch (error) {
    // The partial (drawId, wechatIdentityId) unique index is the final arbiter
    // for concurrent requests made by the same mini-program identity.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false, error: "duplicate" };
    }
    throw error;
  }
}

export interface RecoverPublicLotteryEntryInput
  extends PublicLotteryEntryInput {
  entryToken: string;
}

export type RecoverPublicLotteryEntryResult =
  | { ok: true; data: PublicLotteryEntryData }
  | { ok: false; error: "notFound" };

export async function recoverPublicLotteryEntry(
  drawToken: string,
  input: RecoverPublicLotteryEntryInput,
  requireMiniappEnabled = false
): Promise<RecoverPublicLotteryEntryResult> {
  const draw = await findAvailablePublicDraw(drawToken);
  if (
    !draw ||
    (requireMiniappEnabled &&
      !draw.bookingEvent.owner.settings?.miniappEnabled)
  ) {
    return { ok: false, error: "notFound" };
  }
  const entry = await prisma.lotteryEntry.findUnique({
    where: {
      drawId_token: {
        drawId: draw.id,
        token: input.entryToken.toUpperCase()
      }
    },
    select: {
      id: true,
      token: true,
      name: true,
      contactValue: true,
      wonPrizeId: true
    }
  });
  if (
    !entry ||
    normalizeLotteryIdentity(entry.name) !==
      normalizeLotteryIdentity(input.name) ||
    normalizeLotteryIdentity(entry.contactValue) !==
      normalizeLotteryIdentity(input.contactValue)
  ) {
    return { ok: false, error: "notFound" };
  }
  return {
    ok: true,
    data: {
      id: entry.id,
      token: entry.token,
      wonPrizeId: entry.wonPrizeId
    }
  };
}

export type SpinPublicLotteryEntryResult =
  | { ok: true; data: { prizeId: string; prizeName: string } }
  | {
      ok: false;
      error: "notFound" | "alreadySpun" | "noPrizesLeft";
    };

const SPIN_ERROR_MAP = {
  not_found: "notFound",
  already_spun: "alreadySpun",
  no_prizes_left: "noPrizesLeft"
} as const;

export async function spinPublicLotteryEntry(
  entryId: string,
  options: {
    drawToken?: string;
    wechatIdentityId?: string;
    requireMiniappEnabled?: boolean;
  } = {}
): Promise<SpinPublicLotteryEntryResult> {
  const entry = await prisma.lotteryEntry.findFirst({
    where: {
      id: entryId,
      ...(options.wechatIdentityId
        ? { wechatIdentityId: options.wechatIdentityId }
        : {}),
      ...(options.drawToken
        ? { draw: { token: options.drawToken } }
        : {})
    },
    select: { id: true, drawId: true }
  });
  if (!entry) return { ok: false, error: "notFound" };

  const result = await spinForEntry(
    entry.id,
    entry.drawId,
    true,
    options.requireMiniappEnabled ?? false
  );
  if (!result.ok) {
    return { ok: false, error: SPIN_ERROR_MAP[result.error] };
  }
  return {
    ok: true,
    data: {
      prizeId: result.winner.prizeId,
      prizeName: result.winner.prizeName
    }
  };
}

export type SpinBookingLotteryResult =
  | { ok: true; data: { prizeId: string; prizeName: string } }
  | {
      ok: false;
      error: "notReady" | "notFound" | "alreadySpun" | "noPrizesLeft";
    };

/**
 * Existing private cancel-token lottery flow, extracted unchanged for Web.
 */
export async function spinBookingLottery(
  cancelToken: string
): Promise<SpinBookingLotteryResult> {
  const booking = await prisma.booking.findUnique({
    where: { cancelToken },
    include: {
      lotteryEntry: true,
      timeSlot: {
        include: { bookingEvent: { include: { lotteryDraw: true } } }
      }
    }
  });
  if (!booking || booking.status !== "confirmed") {
    return { ok: false, error: "notFound" };
  }

  const draw = booking.timeSlot.bookingEvent.lotteryDraw;
  if (!draw || !(await findAvailablePublicDraw(draw.token))) {
    return { ok: false, error: "notReady" };
  }

  let entryId = booking.lotteryEntry?.id;
  if (!entryId) {
    const token = await uniqueEntryToken(draw.id);
    const created = await prisma.lotteryEntry
      .create({
        data: {
          drawId: draw.id,
          bookingId: booking.id,
          wechatIdentityId: booking.wechatIdentityId,
          name: booking.name,
          subject: booking.subject,
          token
        }
      })
      .catch(async () => {
        return prisma.lotteryEntry.findUnique({
          where: { bookingId: booking.id }
        });
      });
    entryId = created?.id;
  }
  if (!entryId) return { ok: false, error: "notFound" };

  const result = await spinForEntry(entryId, draw.id, true);
  if (!result.ok) {
    return { ok: false, error: SPIN_ERROR_MAP[result.error] };
  }
  return {
    ok: true,
    data: {
      prizeId: result.winner.prizeId,
      prizeName: result.winner.prizeName
    }
  };
}
