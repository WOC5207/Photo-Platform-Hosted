"use server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { equipmentName, equipmentPhotoUrl } from "@/lib/equipment";
import { equipmentQrToken } from "@/lib/equipmentQr";
import { pickEquipment } from "@/lib/preparation";
import { z } from "zod";

export async function scanEquipment(checklistId: string, value: string, operation: string = "lookup") {
  const user = await getCurrentUser();
  if (!user) return { error: "unauthorized" as const };
  const token = equipmentQrToken(value);
  if (!token || !z.string().min(1).max(100).safeParse(checklistId).success ||
    !["lookup", "add", "SIGNED_OUT", "IN_INVENTORY", "BROKEN"].includes(operation)) return { error: "invalid" as const };
  try {
    const result = await prisma.$transaction(async tx => {
      const checklist = await tx.equipmentChecklist.findFirst({ where: { id: checklistId, ownerId: user.id } });
      const item = await tx.equipmentItem.findFirst({ where: { qrToken: token, ownerId: user.id }, include: { category: true } });
      if (!checklist || !item) return { error: "notFound" as const };
      if (operation === "add") await pickEquipment(tx, user.id, checklistId, [item.id]);
      const member = await tx.equipmentChecklistItem.findFirst({ where: { checklistId, equipmentId: item.id } });
      if (operation !== "lookup" && operation !== "add") {
        if (!member) return { error: "notMember" as const };
        const status = z.enum(["SIGNED_OUT", "IN_INVENTORY", "BROKEN"]).parse(operation);
        const updated = await tx.equipmentItem.updateMany({
          where: { id: item.id, ownerId: user.id, checklistItems: { some: { checklistId, checklist: { ownerId: user.id } } } },
          data: { status }
        });
        if (!updated.count) return { error: "notFound" as const };
        item.status = status;
      }
      return { item: { id: item.id, name: equipmentName(item), serialNumber: item.serialNumber,
        photo: equipmentPhotoUrl(item.photoToken), category: item.category.name, status: item.status, included: Boolean(member) } };
    });
    if (operation !== "lookup" && !result.error) revalidatePath("/", "layout");
    return result;
  } catch { return { error: "failed" as const }; }
}
