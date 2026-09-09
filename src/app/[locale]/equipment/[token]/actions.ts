"use server";

import type { EquipmentStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { QUICK_EQUIPMENT_STATUSES } from "@/lib/equipment";

export type EquipmentQrStatusState = {
  status: EquipmentStatus;
  saved?: boolean;
  error?: "unauthorized" | "forbidden" | "invalid" | "missing" | "failed";
};

const inputSchema = z.object({
  token: z.string().uuid(),
  status: z.enum(QUICK_EQUIPMENT_STATUSES)
});

export async function updateEquipmentQrStatus(
  previous: EquipmentQrStatusState,
  formData: FormData
): Promise<EquipmentQrStatusState> {
  const user = await getCurrentUser();
  if (!user) return { status: previous.status, error: "unauthorized" };

  const parsed = inputSchema.safeParse({
    token: String(formData.get("token") ?? ""),
    status: String(formData.get("status") ?? "")
  });
  if (!parsed.success) return { status: previous.status, error: "invalid" };

  try {
    const item = await prisma.equipmentItem.findUnique({
      where: { qrToken: parsed.data.token },
      select: { ownerId: true }
    });
    if (!item) return { status: previous.status, error: "missing" };
    if (item.ownerId !== user.id) return { status: previous.status, error: "forbidden" };

    const updated = await prisma.equipmentItem.updateMany({
      where: { qrToken: parsed.data.token, ownerId: user.id },
      data: { status: parsed.data.status }
    });
    if (!updated.count) return { status: previous.status, error: "missing" };

    revalidatePath("/", "layout");
    return { status: parsed.data.status, saved: true };
  } catch {
    return { status: previous.status, error: "failed" };
  }
}
