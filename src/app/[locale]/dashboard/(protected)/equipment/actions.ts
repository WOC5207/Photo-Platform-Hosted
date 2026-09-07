"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

const equipmentSchema = z.object({
  name: z.string().trim().min(1).max(160),
  categoryId: z.string().trim().min(1).max(100),
  serialNumber: z.string().trim().max(160),
  notes: z.string().trim().max(2000)
});

const categorySchema = z.string().trim().min(1).max(100);

async function ownerId(): Promise<string> {
  const locale = await getLocale();
  return (await requireUser(locale)).id;
}

function refreshEquipment(): void {
  revalidatePath("/", "layout");
}

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "");
}

export async function createEquipment(formData: FormData): Promise<void> {
  const parsed = equipmentSchema.safeParse({
    name: text(formData, "name"),
    categoryId: text(formData, "categoryId"),
    serialNumber: text(formData, "serialNumber"),
    notes: text(formData, "notes")
  });
  if (!parsed.success) return;

  const owner = await ownerId();
  const category = await prisma.equipmentCategory.findFirst({
    where: { id: parsed.data.categoryId, ownerId: owner },
    select: { id: true }
  });
  if (!category) return;

  await prisma.equipmentItem.create({
    data: {
      ownerId: owner,
      name: parsed.data.name,
      categoryId: category.id,
      serialNumber: parsed.data.serialNumber,
      notes: parsed.data.notes
    }
  });
  refreshEquipment();
}

export async function createEquipmentCategory(formData: FormData): Promise<void> {
  const parsed = categorySchema.safeParse(text(formData, "name"));
  if (!parsed.success) return;
  const owner = await ownerId();
  const normalizedName = parsed.data.toLowerCase();
  await prisma.equipmentCategory.upsert({
    where: { ownerId_normalizedName: { ownerId: owner, normalizedName } },
    update: { name: parsed.data },
    create: { ownerId: owner, name: parsed.data, normalizedName }
  });
  refreshEquipment();
}

export async function deleteEquipmentCategory(formData: FormData): Promise<void> {
  const id = text(formData, "id");
  if (!id) return;
  await prisma.equipmentCategory.deleteMany({
    where: { id, ownerId: await ownerId(), items: { none: {} } }
  });
  refreshEquipment();
}

export async function deleteEquipment(formData: FormData): Promise<void> {
  const id = text(formData, "id");
  if (!id) return;
  await prisma.equipmentItem.deleteMany({
    where: { id, ownerId: await ownerId() }
  });
  refreshEquipment();
}

export async function rotateEquipmentQr(formData: FormData): Promise<void> {
  const id = text(formData, "id");
  if (!id) return;
  await prisma.equipmentItem.updateMany({
    where: { id, ownerId: await ownerId() },
    data: { qrToken: randomUUID() }
  });
  refreshEquipment();
}
