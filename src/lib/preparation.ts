import "server-only";
import type { Prisma } from "@prisma/client";

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
