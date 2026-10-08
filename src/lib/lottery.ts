import "server-only";
import { randomBytes, randomInt } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { lockAvailablePublicDraw } from "./publicLottery";

// Avoids visually ambiguous characters (0/O, 1/I) since tokens are read
// aloud/off a screen during the draw.
const TOKEN_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function randomToken(length = 8): string {
  const bytes = randomBytes(length);
  let s = "";
  for (let i = 0; i < length; i++) s += TOKEN_CHARS[bytes[i] % TOKEN_CHARS.length];
  return s;
}

/** A short display token unique within one draw (used on the wheel). */
export async function uniqueEntryToken(
  drawId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const token = randomToken();
    const existing = await client.lotteryEntry.findUnique({
      where: { drawId_token: { drawId, token } }
    });
    if (!existing) return token;
  }
  throw new Error("could not generate a unique lottery entry token");
}

export async function ensureLotteryDraw(bookingEventId: string) {
  const existing = await prisma.lotteryDraw.findUnique({
    where: { bookingEventId }
  });
  if (existing) return existing;
  return prisma.lotteryDraw.create({
    data: { bookingEventId, token: randomBytes(16).toString("hex") }
  });
}

/**
 * Deletes one owned prize and releases its winners back into the draw.
 *
 * Spins serialize on the LotteryDraw row before reading prize stock. Deletion
 * must take that same lock before resetting winners or removing the prize;
 * otherwise a spin can award the prize between the reset and delete, or make a
 * decision from stock that is being removed concurrently.
 */
export async function deleteLotteryPrizeForOwner(
  prizeId: string,
  ownerId: string
): Promise<boolean> {
  // Unlocked, ownership-scoped peek used only to discover which draw to lock.
  // Every decision and mutation is repeated after the lock is held.
  const target = await prisma.lotteryPrize.findFirst({
    where: { id: prizeId, draw: { bookingEvent: { ownerId } } },
    select: { drawId: true }
  });
  if (!target) return false;

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT id FROM "LotteryDraw" WHERE id = ${target.drawId} FOR UPDATE
    `;

    // The prize may have been deleted while this transaction waited, and the
    // caller's ownership must not be trusted from the pre-lock peek.
    const prize = await tx.lotteryPrize.findFirst({
      where: {
        id: prizeId,
        drawId: target.drawId,
        draw: { bookingEvent: { ownerId } }
      },
      select: { id: true, drawId: true }
    });
    if (!prize) return false;

    await tx.lotteryEntry.updateMany({
      where: { drawId: prize.drawId, wonPrizeId: prize.id },
      data: { wonPrizeId: null, wonAt: null }
    });
    await tx.lotteryPrize.delete({ where: { id: prize.id } });
    return true;
  });
}

/**
 * Winners that still hold a unit of prize stock: self-entries, and entries
 * whose booking is still confirmed. A cancelled booking hands its prize back,
 * so book → spin → cancel loops cannot drain a draw; only the photographer
 * can cancel a booking that has won (see cancelBooking in
 * publicBookingService), so visitors cannot re-spin either. Every stock count (the
 * spin itself, the owner's quantity check, public and owner prize lists) must
 * use this filter so they agree.
 */
export const activeWinnerWhere = {
  OR: [{ bookingId: null }, { booking: { status: "confirmed" } }]
} satisfies Prisma.LotteryEntryWhereInput;

/**
 * For a photographer restoring a cancelled booking, inside their transaction:
 * cancelling handed the booking's prize back (see activeWinnerWhere), so if
 * someone has won that last unit since, the old win must not come back on
 * top of theirs. Clears the entry's prize in that case and returns true; the
 * entry is then back in the draw and can spin again. Takes the draw lock
 * every spin takes, so the count is stable.
 */
export async function releasePrizeTakenSinceCancel(
  tx: Prisma.TransactionClient,
  bookingId: string
): Promise<boolean> {
  const entry = await tx.lotteryEntry.findUnique({
    where: { bookingId },
    select: { id: true, drawId: true, wonPrizeId: true }
  });
  if (!entry?.wonPrizeId) return false;
  await tx.$queryRaw`SELECT id FROM "LotteryDraw" WHERE id = ${entry.drawId} FOR UPDATE`;
  const [prize, holders] = await Promise.all([
    tx.lotteryPrize.findUnique({
      where: { id: entry.wonPrizeId },
      select: { quantity: true }
    }),
    tx.lotteryEntry.count({
      where: { wonPrizeId: entry.wonPrizeId, ...activeWinnerWhere }
    })
  ]);
  if (prize && holders < prize.quantity) return false;
  await tx.lotteryEntry.update({
    where: { id: entry.id },
    data: { wonPrizeId: null, wonAt: null }
  });
  return true;
}

export type SpinResult =
  | {
      ok: true;
      winner: {
        entryId: string;
        token: string;
        name: string;
        subject: string;
        prizeId: string;
        prizeName: string;
      };
    }
  | { ok: false; error: "not_found" | "already_spun" | "no_prizes_left" };

/**
 * Spins the wheel for one entry: picks a prize by weighted random draw among
 * whatever still has stock (an exhausted prize's weight simply drops out,
 * so remaining odds are always renormalized over what's left — this is a
 * "live weighted draw", not a pre-shuffled/guaranteed-fair sequence, so
 * visitors who spin earlier do get better odds at scarce prizes than ones
 * who spin after they run out), then persists the result. Prize stock is
 * derived by counting winners, so the whole draw is locked for the duration
 * of the transaction (see below) to stop two concurrent spins both counting
 * the last unit as available and both awarding it. `expectedDrawId`, when
 * passed, scopes the entry to a specific draw (the public spin action uses
 * this so a visitor can't reference an entry from an unrelated draw).
 */
export async function spinForEntry(
  entryId: string,
  expectedDrawId?: string,
  requirePublicAvailable = false,
  requireMiniappAvailable = false
): Promise<SpinResult> {
  return prisma.$transaction(async (tx) => {
    // Unlocked peek, purely to learn which draw to lock.
    const target = await tx.lotteryEntry.findUnique({
      where: { id: entryId },
      select: { drawId: true }
    });
    if (!target) return { ok: false, error: "not_found" } as const;
    if (expectedDrawId && target.drawId !== expectedDrawId) {
      return { ok: false, error: "not_found" } as const;
    }

    // Serializes every spin in this draw for the rest of the transaction.
    // Both races below need it: prize stock is derived by counting winners,
    // so two concurrent spins would each see wonCount < quantity for the
    // last unit and both award it; and two spins of the *same* entry would
    // each read wonPrizeId as null and the second would overwrite the
    // first's win. Locking the draw rather than the prize covers the whole
    // weighted selection, which reads every prize's stock before choosing.
    // Spins in other draws are unaffected. Every read that a decision
    // depends on must therefore happen *after* this line.
    await tx.$queryRaw`SELECT id FROM "LotteryDraw" WHERE id = ${target.drawId} FOR UPDATE`;

    const publicDraw =
      requirePublicAvailable || requireMiniappAvailable
        ? await lockAvailablePublicDraw(tx, target.drawId, false)
        : null;
    if (requirePublicAvailable && !publicDraw) {
      return { ok: false, error: "not_found" } as const;
    }
    if (
      requireMiniappAvailable &&
      !publicDraw?.bookingEvent.owner.settings?.miniappEnabled
    ) {
      return { ok: false, error: "not_found" } as const;
    }

    const entry = await tx.lotteryEntry.findUnique({ where: { id: entryId } });
    if (!entry) return { ok: false, error: "not_found" } as const;
    // An entry tied to a booking spins only while that booking stands, on
    // every path (web, mini-program, owner). The row lock pairs with the one
    // a visitor's cancel takes, so a cancel cannot slip in between this
    // check and the win below (which would hand the prize straight back).
    if (entry.bookingId) {
      const [booking] = await tx.$queryRaw<{ status: string }[]>`
        SELECT status FROM "Booking" WHERE id = ${entry.bookingId} FOR UPDATE
      `;
      if (booking?.status !== "confirmed") {
        return { ok: false, error: "not_found" } as const;
      }
    }
    if (entry.wonPrizeId) return { ok: false, error: "already_spun" } as const;

    const prizes = await tx.lotteryPrize.findMany({ where: { drawId: entry.drawId } });
    const available: { id: string; name: string; weight: number }[] = [];
    for (const p of prizes) {
      const wonCount = await tx.lotteryEntry.count({
        where: { wonPrizeId: p.id, ...activeWinnerWhere }
      });
      if (wonCount < p.quantity) available.push({ id: p.id, name: p.name, weight: p.weight });
    }
    if (available.length === 0) return { ok: false, error: "no_prizes_left" } as const;

    const totalWeight = available.reduce((sum, p) => sum + p.weight, 0);
    let roll = randomInt(totalWeight);
    let chosen = available[available.length - 1];
    for (const p of available) {
      if (roll < p.weight) {
        chosen = p;
        break;
      }
      roll -= p.weight;
    }

    await tx.lotteryEntry.update({
      where: { id: entryId },
      data: { wonPrizeId: chosen.id, wonAt: new Date() }
    });

    return {
      ok: true,
      winner: {
        entryId: entry.id,
        token: entry.token,
        name: entry.name,
        subject: entry.subject,
        prizeId: chosen.id,
        prizeName: chosen.name
      }
    } as const;
  });
}
