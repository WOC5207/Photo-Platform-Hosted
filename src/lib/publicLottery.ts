import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";

type Transaction = Prisma.TransactionClient;

function available<T extends {
  open: boolean;
  bookingEvent: {
    lotteryEnabled: boolean;
    owner: { status: string; settings: { lotteryEnabled: boolean } | null };
  };
}>(draw: T | null, requireOpen: boolean): draw is T {
  return Boolean(
    draw &&
      draw.bookingEvent.owner.status === "active" &&
      draw.bookingEvent.owner.settings?.lotteryEnabled &&
      draw.bookingEvent.lotteryEnabled &&
      (!requireOpen || draw.open)
  );
}

const bookingEventInclude = {
  owner: {
    select: {
      status: true,
      settings: {
        select: {
          lotteryEnabled: true,
          miniappEnabled: true,
          timeZone: true
        }
      }
    }
  }
} satisfies Prisma.BookingEventInclude;

export async function findAvailablePublicDraw(token: string, requireOpen = false) {
  const draw = await prisma.lotteryDraw.findUnique({
    where: { token },
    include: { bookingEvent: { include: bookingEventInclude } }
  });
  return available(draw, requireOpen) ? draw : null;
}

/** Locks the draw before checking every public-availability switch. */
export async function lockAvailablePublicDraw(
  tx: Transaction,
  drawId: string,
  requireOpen = false
) {
  await tx.$queryRaw`SELECT id FROM "LotteryDraw" WHERE id = ${drawId} FOR UPDATE`;
  const draw = await tx.lotteryDraw.findUnique({
    where: { id: drawId },
    include: { bookingEvent: { include: bookingEventInclude } }
  });
  return available(draw, requireOpen) ? draw : null;
}

export async function lockAvailablePublicDrawByToken(
  tx: Transaction,
  token: string,
  requireOpen = false
) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "LotteryDraw" WHERE token = ${token} FOR UPDATE
  `;
  const id = rows[0]?.id;
  if (!id) return null;
  const draw = await tx.lotteryDraw.findUnique({
    where: { id },
    include: { bookingEvent: { include: bookingEventInclude } }
  });
  return available(draw, requireOpen) ? draw : null;
}
