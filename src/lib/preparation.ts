import "server-only";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";

/** Caller authenticates the owner; every write independently enforces ownership. */
export async function setSlotFinished(tx: Prisma.TransactionClient, ownerId: string, id: string, finished: boolean) {
  return tx.timeSlot.updateMany({
    where: { id, bookingEvent: { ownerId }, bookings: { some: { status: "confirmed" } },
      ...(finished ? { finishedAt: null } : {}) },
    data: { finishedAt: finished ? new Date() : null }
  });
}

export async function pickEquipment(tx: Prisma.TransactionClient, ownerId: string, checklistId: string, ids: string[]) {
  const uniqueIds = [...new Set(ids)];
  if (!uniqueIds.length || uniqueIds.length > 500) return;
  const [checklist, equipment, last] = await Promise.all([
    tx.equipmentChecklist.findFirst({ where: { id: checklistId, ownerId }, select: { id: true } }),
    tx.equipmentItem.findMany({ where: { id: { in: uniqueIds }, ownerId }, orderBy: { name: "asc" } }),
    tx.equipmentChecklistItem.aggregate({ where: { checklistId, checklist: { ownerId } }, _max: { sortOrder: true } })
  ]);
  if (!checklist || equipment.length !== uniqueIds.length) return;
  await tx.equipmentChecklistItem.createMany({
    data: equipment.map((item, index) => ({ checklistId, equipmentId: item.id, label: item.name, sortOrder: (last._max.sortOrder ?? -1) + index + 1 })),
    skipDuplicates: true
  });
}

export type ChecklistItemState = "PLANNED" | "AT_EVENT" | "RETURNED" | "BROKEN";

/**
 * Moves one piece of equipment on a packing list along the event day, and
 * its inventory status with it: out at the event, back in inventory, broken,
 * or (undoing a mark) planned again and in inventory.
 */
export async function setChecklistItemState(ownerId: string, checklistId: string, equipmentId: string, state: ChecklistItemState) {
  const now = new Date();
  const change = {
    PLANNED: { item: { signedOutAt: null, returnedAt: null, brokenAt: null }, status: "IN_INVENTORY" },
    AT_EVENT: { item: { signedOutAt: now, returnedAt: null, brokenAt: null }, status: "SIGNED_OUT" },
    RETURNED: { item: { returnedAt: now }, status: "IN_INVENTORY" },
    BROKEN: { item: { brokenAt: now }, status: "BROKEN" }
  } as const;
  await prisma.$transaction(async (tx) => {
    const member = await tx.equipmentChecklistItem.findFirst({
      where: { checklistId, equipmentId, checklist: { ownerId } },
      select: { id: true }
    });
    if (!member) return;
    await Promise.all([
      tx.equipmentChecklistItem.update({ where: { id: member.id }, data: { eventState: state, ...change[state].item } }),
      tx.equipmentItem.updateMany({ where: { id: equipmentId, ownerId }, data: { status: change[state].status } })
    ]);
  });
}

const checklistSchema = z.object({
  name: z.string().trim().min(1).max(160),
  shootDate: z.string().trim().max(10),
  notes: z.string().trim().max(1000)
});

function optionalShootDate(value: string): Date | null | undefined {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/** A standalone packing checklist from its form; the new id, or null when the form is invalid. */
export async function createOwnedChecklist(ownerId: string, formData: FormData): Promise<string | null> {
  const parsed = checklistSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    shootDate: String(formData.get("shootDate") ?? ""),
    notes: String(formData.get("notes") ?? "")
  });
  if (!parsed.success) return null;
  const shootDate = optionalShootDate(parsed.data.shootDate);
  if (shootDate === undefined) return null;
  const checklist = await prisma.equipmentChecklist.create({
    data: { ownerId, name: parsed.data.name, shootDate, notes: parsed.data.notes },
    select: { id: true }
  });
  return checklist.id;
}

/**
 * Delete one of the owner's checklists. Resolves to the booking event its
 * day belongs to ("" for a standalone list), or null when there was none.
 */
export async function deleteOwnedChecklist(ownerId: string, id: string): Promise<string | null> {
  const checklist = await prisma.equipmentChecklist.findFirst({
    where: { id, ownerId },
    select: { bookingDay: { select: { bookingEventId: true } } }
  });
  if (!checklist) return null;
  await prisma.equipmentChecklist.deleteMany({ where: { id, ownerId } });
  return checklist.bookingDay?.bookingEventId ?? "";
}
