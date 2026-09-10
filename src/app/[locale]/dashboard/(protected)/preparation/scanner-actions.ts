"use server";

import type { EquipmentChecklistState, EquipmentStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { equipmentName, equipmentPhotoUrl } from "@/lib/equipment";
import { equipmentQrToken } from "@/lib/equipmentQr";
import { pickEquipment } from "@/lib/preparation";

export type ScanSessionMode = "ARRIVAL" | "RETURN" | "REPORT_BROKEN";

export type ScanProgress = {
  total: number;
  planned: number;
  atEvent: number;
  returned: number;
  broken: number;
};

const operationSchema = z.enum([
  "lookup",
  "add",
  "ARRIVAL",
  "RETURN",
  "REPORT_BROKEN",
  // Kept for existing direct status controls and older action clients.
  "SIGNED_OUT",
  "IN_INVENTORY",
  "BROKEN"
]);

const sessionOperations = new Set<ScanSessionMode>([
  "ARRIVAL",
  "RETURN",
  "REPORT_BROKEN"
]);

const statusForOperation: Record<ScanSessionMode | "SIGNED_OUT" | "IN_INVENTORY" | "BROKEN", EquipmentStatus> = {
  ARRIVAL: "SIGNED_OUT",
  RETURN: "IN_INVENTORY",
  REPORT_BROKEN: "BROKEN",
  SIGNED_OUT: "SIGNED_OUT",
  IN_INVENTORY: "IN_INVENTORY",
  BROKEN: "BROKEN"
};

const stateForOperation: Record<ScanSessionMode | "SIGNED_OUT" | "IN_INVENTORY" | "BROKEN", EquipmentChecklistState> = {
  ARRIVAL: "AT_EVENT",
  RETURN: "RETURNED",
  REPORT_BROKEN: "BROKEN",
  SIGNED_OUT: "AT_EVENT",
  IN_INVENTORY: "RETURNED",
  BROKEN: "BROKEN"
};

async function checklistProgress(
  tx: Prisma.TransactionClient,
  checklistId: string
): Promise<ScanProgress> {
  const grouped = await tx.equipmentChecklistItem.groupBy({
    by: ["eventState"],
    where: { checklistId, equipmentId: { not: null } },
    _count: { _all: true }
  });
  const counts = new Map(grouped.map((row) => [row.eventState, row._count._all]));
  const planned = counts.get("PLANNED") ?? 0;
  const atEvent = counts.get("AT_EVENT") ?? 0;
  const returned = counts.get("RETURNED") ?? 0;
  const broken = counts.get("BROKEN") ?? 0;
  return { total: planned + atEvent + returned + broken, planned, atEvent, returned, broken };
}

export async function scanEquipment(
  checklistId: string,
  value: string,
  operation: string = "lookup"
) {
  const user = await getCurrentUser();
  if (!user) return { error: "unauthorized" as const };
  const token = equipmentQrToken(value);
  const parsedOperation = operationSchema.safeParse(operation);
  if (
    !token ||
    !z.string().min(1).max(100).safeParse(checklistId).success ||
    !parsedOperation.success
  ) {
    return { error: "invalid" as const };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const [checklist, item] = await Promise.all([
        tx.equipmentChecklist.findFirst({
          where: { id: checklistId, ownerId: user.id },
          select: { id: true }
        }),
        tx.equipmentItem.findFirst({
          where: { qrToken: token, ownerId: user.id },
          include: { category: true }
        })
      ]);
      if (!checklist || !item) return { error: "notFound" as const };

      let member = await tx.equipmentChecklistItem.findFirst({
        where: { checklistId, equipmentId: item.id }
      });
      let added = false;
      const currentOperation = parsedOperation.data;

      if (!member && (currentOperation === "add" || sessionOperations.has(currentOperation as ScanSessionMode))) {
        await pickEquipment(tx, user.id, checklistId, [item.id]);
        member = await tx.equipmentChecklistItem.findFirst({
          where: { checklistId, equipmentId: item.id }
        });
        added = Boolean(member);
      }

      const isStatusOperation = currentOperation in statusForOperation;
      if (isStatusOperation) {
        if (!member) return { error: "notMember" as const };
        const statusOperation = currentOperation as keyof typeof statusForOperation;
        const status = statusForOperation[statusOperation];
        const eventState = stateForOperation[statusOperation];
        const duplicate = member.eventState === eventState && item.status === status;
        const now = new Date();

        if (!duplicate) {
          const [checklistUpdate, inventoryUpdate] = await Promise.all([
            tx.equipmentChecklistItem.updateMany({
              where: {
                id: member.id,
                checklistId,
                equipmentId: item.id,
                checklist: { ownerId: user.id }
              },
              data: {
                eventState,
                lastScannedAt: sessionOperations.has(currentOperation as ScanSessionMode) ? now : member.lastScannedAt,
                ...(eventState === "AT_EVENT" ? { signedOutAt: now, returnedAt: null, brokenAt: null } : {}),
                ...(eventState === "RETURNED" ? { returnedAt: now } : {}),
                ...(eventState === "BROKEN" ? { brokenAt: now } : {})
              }
            }),
            tx.equipmentItem.updateMany({
              where: { id: item.id, ownerId: user.id },
              data: { status }
            })
          ]);
          if (!checklistUpdate.count || !inventoryUpdate.count) return { error: "notFound" as const };
          member.eventState = eventState;
          item.status = status;
        }

        return {
          item: {
            id: item.id,
            name: equipmentName(item),
            serialNumber: item.serialNumber,
            photo: equipmentPhotoUrl(item.photoToken),
            category: item.category.name,
            status: item.status,
            eventState: member.eventState,
            included: true
          },
          added,
          duplicate,
          progress: await checklistProgress(tx, checklistId)
        };
      }

      return {
        item: {
          id: item.id,
          name: equipmentName(item),
          serialNumber: item.serialNumber,
          photo: equipmentPhotoUrl(item.photoToken),
          category: item.category.name,
          status: item.status,
          eventState: member?.eventState ?? null,
          included: Boolean(member)
        },
        added,
        duplicate: false,
        progress: await checklistProgress(tx, checklistId)
      };
    });

    if (parsedOperation.data !== "lookup" && !("error" in result)) {
      revalidatePath("/", "layout");
    }
    return result;
  } catch {
    return { error: "failed" as const };
  }
}
