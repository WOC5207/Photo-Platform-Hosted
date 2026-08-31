"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

const equipmentSchema = z.object({
  name: z.string().trim().min(1).max(160),
  category: z.string().trim().max(100),
  serialNumber: z.string().trim().max(160),
  notes: z.string().trim().max(2000)
});

const checklistSchema = z.object({
  name: z.string().trim().min(1).max(160),
  shootDate: z.string().trim().max(10),
  notes: z.string().trim().max(1000)
});

const customItemSchema = z.string().trim().min(1).max(200);

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

function optionalShootDate(value: string): Date | null | undefined {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export async function createEquipment(formData: FormData): Promise<void> {
  const parsed = equipmentSchema.safeParse({
    name: text(formData, "name"),
    category: text(formData, "category"),
    serialNumber: text(formData, "serialNumber"),
    notes: text(formData, "notes")
  });
  if (!parsed.success) return;

  await prisma.equipmentItem.create({
    data: { ownerId: await ownerId(), ...parsed.data }
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

export async function createChecklist(formData: FormData): Promise<void> {
  const parsed = checklistSchema.safeParse({
    name: text(formData, "name"),
    shootDate: text(formData, "shootDate"),
    notes: text(formData, "notes")
  });
  if (!parsed.success) return;
  const shootDate = optionalShootDate(parsed.data.shootDate);
  if (shootDate === undefined) return;

  await prisma.equipmentChecklist.create({
    data: {
      ownerId: await ownerId(),
      name: parsed.data.name,
      shootDate,
      notes: parsed.data.notes
    }
  });
  refreshEquipment();
}

export async function deleteChecklist(formData: FormData): Promise<void> {
  const id = text(formData, "id");
  if (!id) return;
  await prisma.equipmentChecklist.deleteMany({
    where: { id, ownerId: await ownerId() }
  });
  refreshEquipment();
}

export async function addEquipmentToChecklist(formData: FormData): Promise<void> {
  const checklistId = text(formData, "checklistId");
  const equipmentId = text(formData, "equipmentId");
  if (!checklistId || !equipmentId) return;
  const owner = await ownerId();

  await prisma.$transaction(async (tx) => {
    const [checklist, equipment, last] = await Promise.all([
      tx.equipmentChecklist.findFirst({ where: { id: checklistId, ownerId: owner } }),
      tx.equipmentItem.findFirst({ where: { id: equipmentId, ownerId: owner } }),
      tx.equipmentChecklistItem.aggregate({
        where: { checklistId, checklist: { ownerId: owner } },
        _max: { sortOrder: true }
      })
    ]);
    if (!checklist || !equipment) return;

    await tx.equipmentChecklistItem.upsert({
      where: { checklistId_equipmentId: { checklistId, equipmentId } },
      update: { label: equipment.name },
      create: {
        checklistId,
        equipmentId,
        label: equipment.name,
        sortOrder: (last._max.sortOrder ?? -1) + 1
      }
    });
  });
  refreshEquipment();
}

export async function addCustomChecklistItem(formData: FormData): Promise<void> {
  const checklistId = text(formData, "checklistId");
  const parsed = customItemSchema.safeParse(text(formData, "label"));
  if (!checklistId || !parsed.success) return;
  const owner = await ownerId();

  await prisma.$transaction(async (tx) => {
    const checklist = await tx.equipmentChecklist.findFirst({
      where: { id: checklistId, ownerId: owner }
    });
    if (!checklist) return;
    const last = await tx.equipmentChecklistItem.aggregate({
      where: { checklistId },
      _max: { sortOrder: true }
    });
    await tx.equipmentChecklistItem.create({
      data: {
        checklistId,
        label: parsed.data,
        sortOrder: (last._max.sortOrder ?? -1) + 1
      }
    });
  });
  refreshEquipment();
}

export async function toggleChecklistItem(formData: FormData): Promise<void> {
  const id = text(formData, "id");
  if (!id) return;
  await prisma.equipmentChecklistItem.updateMany({
    where: { id, checklist: { ownerId: await ownerId() } },
    data: { checked: text(formData, "checked") === "true" }
  });
  refreshEquipment();
}

export async function removeChecklistItem(formData: FormData): Promise<void> {
  const id = text(formData, "id");
  if (!id) return;
  await prisma.equipmentChecklistItem.deleteMany({
    where: { id, checklist: { ownerId: await ownerId() } }
  });
  refreshEquipment();
}

export async function resetChecklist(formData: FormData): Promise<void> {
  const checklistId = text(formData, "checklistId");
  if (!checklistId) return;
  await prisma.equipmentChecklistItem.updateMany({
    where: { checklistId, checklist: { ownerId: await ownerId() } },
    data: { checked: false }
  });
  refreshEquipment();
}
