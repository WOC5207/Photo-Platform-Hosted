import "server-only";
import type { User } from "@prisma/client";
import { prisma } from "./db";

/**
 * Ownership lookups for every model a request can name by id.
 *
 * Why these exist: authentication answers "is someone signed in", which is not
 * the same question as "does this row belong to them". Every server action here
 * takes an id straight from a form body, so with more than one account an
 * auth-only check means any user can edit or delete any other user's content by
 * posting a foreign id. These helpers make the second question hard to skip.
 *
 * The rule they encode: a bare findUnique({ where: { id } }) on an owned model
 * cannot express an owner filter, so it can never be made safe by adding a
 * condition — it has to change shape. Treat any remaining findUnique-by-id on
 * owned data as a bug.
 *
 * Photos, credits, slots, bookings and lottery rows have no ownerId of their
 * own; they inherit it through their parent (a denormalised copy would be a
 * second source of truth that can drift). So they filter on the relation —
 * where: { id, event: { ownerId } } — which keeps the check in the same query
 * as the read, rather than a separate step someone can forget to repeat before
 * the write.
 *
 * There is deliberately NO platform-admin bypass here. These back the per-user
 * dashboard, where every action is scoped to "my site", and an admin editing
 * through those forms is editing their own content like anyone else. A bypass
 * would buy nothing and would mean a stray admin request could silently
 * overwrite a stranger's album. Admin-wide tooling gets its own explicit,
 * clearly-labelled queries instead.
 */

export async function findOwnedEvent(id: string, user: User) {
  return prisma.event.findFirst({ where: { id, ownerId: user.id } });
}

export async function findOwnedPhoto(id: string, user: User) {
  return prisma.photo.findFirst({
    where: { id, pendingBatchId: null, event: { ownerId: user.id } },
    include: { event: { select: { id: true, ownerId: true } } }
  });
}

/**
 * Owned photo lookup for deletion only. Unlike normal photo actions, deleting
 * is valid for both finalized photos and private pending uploads.
 */
export async function findOwnedPhotoForDeletion(id: string, user: User) {
  return prisma.photo.findFirst({
    where: { id, event: { ownerId: user.id } },
    include: { event: { select: { id: true, ownerId: true } } }
  });
}

export async function findOwnedBookingEvent(id: string, user: User) {
  return prisma.bookingEvent.findFirst({ where: { id, ownerId: user.id } });
}

export async function findOwnedDraw(id: string, user: User) {
  return prisma.lotteryDraw.findFirst({
    where: { id, bookingEvent: { ownerId: user.id } }
  });
}

export async function findOwnedSlot(id: string, user: User) {
  return prisma.timeSlot.findFirst({
    where: { id, bookingEvent: { ownerId: user.id } }
  });
}

/** One day of an owned booking event — the grain slots are added under. */
export async function findOwnedBookingDay(id: string, user: User) {
  return prisma.bookingDay.findFirst({
    where: { id, bookingEvent: { ownerId: user.id } },
    select: { id: true, date: true, bookingEventId: true }
  });
}

/** A visitor's booking, reachable only through the slot's owning event. */
export async function findOwnedBooking(id: string, user: User) {
  return prisma.booking.findFirst({
    where: { id, timeSlot: { bookingEvent: { ownerId: user.id } } },
    include: { timeSlot: true }
  });
}

export async function findOwnedEntry(id: string, user: User) {
  return prisma.lotteryEntry.findFirst({
    where: { id, draw: { bookingEvent: { ownerId: user.id } } }
  });
}

export async function findOwnedPrize(id: string, user: User) {
  return prisma.lotteryPrize.findFirst({
    where: { id, draw: { bookingEvent: { ownerId: user.id } } }
  });
}

/**
 * Narrows a caller-supplied list of photo ids to the ones the user actually
 * owns. For the bulk actions, which accept an arbitrary id array from the
 * client: filtering here means a crafted request silently does nothing to other
 * people's photos instead of deleting them.
 */
export async function filterOwnedPhotoIds(
  ids: string[],
  user: User
): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.photo.findMany({
    where: {
      id: { in: ids },
      pendingBatchId: null,
      event: { ownerId: user.id }
    },
    select: { id: true }
  });
  return rows.map((r) => r.id);
}

/** Bulk counterpart used only by delete/discard workflows. */
export async function filterOwnedPhotoIdsForDeletion(
  ids: string[],
  user: User
): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.photo.findMany({
    where: { id: { in: ids }, event: { ownerId: user.id } },
    select: { id: true }
  });
  return rows.map((r) => r.id);
}
