import "server-only";
import type { BookingEvent, TimeSlot } from "@prisma/client";
import { prisma } from "./db";

export interface BookingDetails {
  name: string;
  subject: string;
  contactMethod: string;
  contactValue: string;
  notes: string;
  cancelToken: string;
}

export type ReserveSlotResult =
  | { ok: true; slot: TimeSlot & { bookingEvent: BookingEvent } }
  | { ok: false; error: "slotUnavailable" | "closed" | "slotFull" };

/**
 * Books one spot in a time slot if capacity allows, as a single atomic unit.
 * Lives here rather than inline in the server action so the concurrency
 * invariant it protects can be exercised directly by a test — the action
 * itself is unreachable from a test harness (it needs request context, and
 * its per-IP rate limit would throttle a concurrent run long before the
 * transaction ever saw the load).
 *
 * The SELECT ... FOR UPDATE takes a row lock on the slot for the rest of the
 * transaction, so two concurrent attempts on the last spot are serialized and
 * the second sees the first's booking in its count. Without it, Postgres'
 * READ COMMITTED default lets both reads observe capacity - 1 and both
 * inserts succeed. (This invariant previously rode on SQLite's serialized
 * writes via connection_limit=1, which Postgres does not give us.)
 *
 * Locking the slot row rather than raising the isolation level keeps bookings
 * for *different* slots fully parallel, and avoids serialization failures
 * that callers would have to catch and retry.
 */
export async function reserveSlot(
  slotId: string,
  details: BookingDetails
): Promise<ReserveSlotResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "TimeSlot" WHERE id = ${slotId} FOR UPDATE`;

    const slot = await tx.timeSlot.findUnique({
      where: { id: slotId },
      include: { bookingEvent: true }
    });
    if (!slot) return { ok: false, error: "slotUnavailable" } as const;
    if (!slot.bookingEvent.open) return { ok: false, error: "closed" } as const;

    const confirmed = await tx.booking.count({
      where: { timeSlotId: slot.id, status: "confirmed" }
    });
    if (confirmed >= slot.capacity) return { ok: false, error: "slotFull" } as const;

    await tx.booking.create({
      data: {
        timeSlotId: slot.id,
        name: details.name,
        subject: details.subject,
        contactMethod: details.contactMethod,
        contactValue: details.contactValue,
        notes: details.notes,
        cancelToken: details.cancelToken
      }
    });
    return { ok: true, slot } as const;
  });
}
