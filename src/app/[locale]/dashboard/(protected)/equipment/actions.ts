"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { discardSiteImage } from "@/lib/siteImages";
import { EQUIPMENT_STATUSES, equipmentName } from "@/lib/equipment";
import { invalidatePublicMedia } from "@/lib/publicMediaCache";

const equipmentSchema = z.object({
  brand: z.string().trim().min(1).max(100),
  model: z.string().trim().min(1).max(160),
  categoryId: z.string().trim().min(1).max(100),
  status: z.enum(EQUIPMENT_STATUSES),
  statusNote: z.string().trim().max(1000),
  serialNumber: z.string().trim().max(160),
  notes: z.string().trim().max(2000)
});

const categorySchema = z.string().trim().min(1).max(100);
const equipmentOrderSchema = z.array(z.string().trim().min(1).max(100)).max(1000);

async function ownerId(): Promise<string> {
  const locale = await getLocale();
  return (await requireUser(locale)).id;
}

function refreshEquipment(): void {
  invalidatePublicMedia();
  revalidatePath("/", "layout");
}

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "");
}

export async function createEquipment(formData: FormData): Promise<{ id?: string; error?: "invalid" }> {
  const parsed = equipmentSchema.safeParse({
    brand: text(formData, "brand"),
    model: text(formData, "model"),
    categoryId: text(formData, "categoryId"),
    status: text(formData, "status"),
    statusNote: text(formData, "statusNote"),
    serialNumber: text(formData, "serialNumber"),
    notes: text(formData, "notes")
  });
  if (!parsed.success) return { error: "invalid" };

  const owner = await ownerId();
  const category = await prisma.equipmentCategory.findFirst({
    where: { id: parsed.data.categoryId, ownerId: owner },
    select: { id: true }
  });
  if (!category) return { error: "invalid" };

  const created = await prisma.$transaction(async (tx) => {
    const latest = await tx.equipmentItem.aggregate({
      where: { ownerId: owner },
      _max: { sortOrder: true }
    });
    return tx.equipmentItem.create({
      data: {
        ownerId: owner,
        name: equipmentName({ name: "", brand: parsed.data.brand, model: parsed.data.model }),
        brand: parsed.data.brand,
        model: parsed.data.model,
        categoryId: category.id,
        status: parsed.data.status,
        statusNote: parsed.data.statusNote,
        serialNumber: parsed.data.serialNumber,
        notes: parsed.data.notes,
        sortOrder: (latest._max.sortOrder ?? -1) + 1
      },
      select: { id: true }
    });
  });
  refreshEquipment();
  return created;
}

export async function updateEquipment(formData: FormData): Promise<void> {
  const id = text(formData, "id");
  const parsed = equipmentSchema.safeParse({
    brand: text(formData, "brand"),
    model: text(formData, "model"),
    categoryId: text(formData, "categoryId"),
    status: text(formData, "status"),
    statusNote: text(formData, "statusNote"),
    serialNumber: text(formData, "serialNumber"),
    notes: text(formData, "notes")
  });
  if (!id || !parsed.success) return;
  const owner = await ownerId();
  const category = await prisma.equipmentCategory.findFirst({
    where: { id: parsed.data.categoryId, ownerId: owner }, select: { id: true }
  });
  if (!category) return;
  await prisma.equipmentItem.updateMany({
    where: { id, ownerId: owner },
    data: {
      name: equipmentName({ name: "", brand: parsed.data.brand, model: parsed.data.model }),
      brand: parsed.data.brand,
      model: parsed.data.model,
      categoryId: category.id,
      status: parsed.data.status,
      statusNote: parsed.data.statusNote,
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
  const owner = await ownerId();
  const item = await prisma.equipmentItem.findFirst({
    where: { id, ownerId: owner }, select: { photoToken: true }
  });
  if (!item) return;
  await prisma.equipmentItem.deleteMany({ where: { id, ownerId: owner } });
  if (item.photoToken) await discardSiteImage(owner, item.photoToken);
  refreshEquipment();
}

export async function removeEquipmentPhoto(formData: FormData): Promise<void> {
  const id = text(formData, "id");
  if (!id) return;
  const owner = await ownerId();
  const item = await prisma.equipmentItem.findFirst({
    where: { id, ownerId: owner }, select: { photoToken: true }
  });
  if (!item?.photoToken) return;
  await prisma.equipmentItem.updateMany({
    where: { id, ownerId: owner, photoToken: item.photoToken }, data: { photoToken: "" }
  });
  await discardSiteImage(owner, item.photoToken);
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

export async function reorderEquipment(
  ids: string[]
): Promise<{ success: true } | { error: "invalid" | "forbidden" | "update" }> {
  const parsed = equipmentOrderSchema.safeParse(ids);
  if (!parsed.success || new Set(parsed.data).size !== parsed.data.length) {
    return { error: "invalid" };
  }

  const owner = await ownerId();
  const owned = await prisma.equipmentItem.findMany({
    where: { ownerId: owner },
    select: { id: true }
  });
  if (
    owned.length !== parsed.data.length ||
    owned.some((item) => !parsed.data.includes(item.id))
  ) {
    return { error: "forbidden" };
  }

  try {
    await prisma.$transaction(
      parsed.data.map((id, sortOrder) =>
        prisma.equipmentItem.updateMany({
          where: { id, ownerId: owner },
          data: { sortOrder }
        })
      )
    );
    refreshEquipment();
    return { success: true };
  } catch {
    return { error: "update" };
  }
}
