"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  findOwnedBookingEvent,
  findOwnedDraw,
  findOwnedEntry,
  findOwnedPrize
} from "@/lib/ownership";
import {
  ensureLotteryDraw,
  spinForEntry,
  uniqueEntryToken,
  type SpinResult
} from "@/lib/lottery";

/** See the note in the events actions: signed in is not the same as owns it. */
async function guard(): Promise<User> {
  return requireUser(await getLocale());
}

/**
 * Master switch for the whole prize-draw tool on one booking event. Off by
 * default; while off, the "Prize draw" link is hidden from the event page and
 * the public entry link 404s. When on, visitors can spin straight away — there
 * is no separate per-draw "allow spinning" switch; only `open` (whether the
 * public link still takes new self-entries) remains underneath.
 */
export async function updateLotteryEnabled(formData: FormData): Promise<void> {
  const user = await guard();
  const bookingEventId = formData.get("bookingEventId");
  if (typeof bookingEventId !== "string") return;

  const event = await findOwnedBookingEvent(bookingEventId, user);
  if (!event) return;

  const lotteryEnabled = formData.get("lotteryEnabled") === "on";
  await prisma.bookingEvent
    .update({ where: { id: event.id }, data: { lotteryEnabled } })
    .catch(() => {});
  revalidatePath("/", "layout");
}

export async function addLotteryEntries(formData: FormData): Promise<void> {
  const user = await guard();
  const bookingEventId = formData.get("bookingEventId");
  if (typeof bookingEventId !== "string") return;

  const event = await findOwnedBookingEvent(bookingEventId, user);
  if (!event) return;

  const bookingIds = formData
    .getAll("bookingIds")
    .filter((v): v is string => typeof v === "string");
  if (bookingIds.length === 0) return;

  const draw = await ensureLotteryDraw(event.id);
  // Constrain the posted ids to bookings actually made on THIS event. An
  // unscoped `id: { in: bookingIds }` accepted any booking on the platform and
  // copied its visitor's name and subject into this draw.
  const bookings = await prisma.booking.findMany({
    where: {
      id: { in: bookingIds },
      timeSlot: { bookingEventId: event.id }
    }
  });

  for (const booking of bookings) {
    const token = await uniqueEntryToken(draw.id);
    await prisma.lotteryEntry
      .create({
        data: {
          drawId: draw.id,
          bookingId: booking.id,
          name: booking.name,
          subject: booking.subject,
          token
        }
      })
      .catch(() => {});
  }
  revalidatePath("/", "layout");
}

export async function removeLotteryEntry(formData: FormData): Promise<void> {
  const user = await guard();
  const entryId = formData.get("entryId");
  if (typeof entryId !== "string") return;

  const entry = await findOwnedEntry(entryId, user);
  if (!entry) return;

  await prisma.lotteryEntry.delete({ where: { id: entry.id } }).catch(() => {});
  revalidatePath("/", "layout");
}

export async function updateLotteryDrawOpen(formData: FormData): Promise<void> {
  const user = await guard();
  const drawId = formData.get("drawId");
  if (typeof drawId !== "string") return;

  const draw = await findOwnedDraw(drawId, user);
  if (!draw) return;

  const open = formData.get("open") === "on";
  await prisma.lotteryDraw
    .update({ where: { id: draw.id }, data: { open } })
    .catch(() => {});
  revalidatePath("/", "layout");
}

export type LotteryPrizeState = { error?: "validation"; ok?: boolean };

const prizeSchema = z.object({
  name: z.string().trim().min(1).max(200),
  quantity: z.coerce.number().int().min(1).max(9999),
  weight: z.coerce.number().int().min(1).max(9999)
});

export async function addLotteryPrize(
  _prev: LotteryPrizeState,
  formData: FormData
): Promise<LotteryPrizeState> {
  const user = await guard();
  const bookingEventId = formData.get("bookingEventId");
  if (typeof bookingEventId !== "string") return { error: "validation" };

  const event = await findOwnedBookingEvent(bookingEventId, user);
  if (!event) return { error: "validation" };

  const parsed = prizeSchema.safeParse({
    name: formData.get("name") ?? "",
    quantity: formData.get("quantity") ?? "",
    weight: formData.get("weight") ?? ""
  });
  if (!parsed.success) return { error: "validation" };

  const draw = await ensureLotteryDraw(event.id);
  const count = await prisma.lotteryPrize.count({ where: { drawId: draw.id } });
  await prisma.lotteryPrize.create({
    data: {
      drawId: draw.id,
      name: parsed.data.name,
      quantity: parsed.data.quantity,
      weight: parsed.data.weight,
      sortOrder: count
    }
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateLotteryPrize(formData: FormData): Promise<void> {
  const user = await guard();
  const prizeId = formData.get("prizeId");
  if (typeof prizeId !== "string") return;

  const prize = await findOwnedPrize(prizeId, user);
  if (!prize) return;

  const parsed = prizeSchema.safeParse({
    name: formData.get("name") ?? "",
    quantity: formData.get("quantity") ?? "",
    weight: formData.get("weight") ?? ""
  });
  if (!parsed.success) return;

  await prisma.lotteryPrize
    .update({
      where: { id: prize.id },
      data: {
        name: parsed.data.name,
        quantity: parsed.data.quantity,
        weight: parsed.data.weight
      }
    })
    .catch(() => {});
  revalidatePath("/", "layout");
}

/**
 * Deleting a prize releases any entries that had won it back into the pool
 * (rather than leaving them permanently marked as winners of a prize that no
 * longer exists), so the admin can safely re-run that portion of the draw.
 */
export async function deleteLotteryPrize(formData: FormData): Promise<void> {
  const user = await guard();
  const prizeId = formData.get("prizeId");
  if (typeof prizeId !== "string") return;

  const prize = await findOwnedPrize(prizeId, user);
  if (!prize) return;

  await prisma.$transaction([
    prisma.lotteryEntry.updateMany({
      where: { wonPrizeId: prize.id },
      data: { wonPrizeId: null, wonAt: null }
    }),
    prisma.lotteryPrize.delete({ where: { id: prize.id } })
  ]);
  revalidatePath("/", "layout");
}

export type { SpinResult };

/**
 * Spins the wheel on behalf of one entry (e.g. the admin running the draw
 * in person for a walk-up entrant without their own device). The prize is
 * chosen server-side by weighted random draw among prizes still in stock —
 * see spinForEntry for the fairness model.
 */
export async function spinLotteryEntry(entryId: string): Promise<SpinResult> {
  const user = await guard();
  const entry = await findOwnedEntry(entryId, user);
  if (!entry) return { ok: false, error: "not_found" };

  const result = await spinForEntry(entry.id, entry.drawId);
  revalidatePath("/", "layout");
  return result;
}
