"use server";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { pickText } from "@/lib/content";
import { redirect } from "next/navigation";
import { pickEquipment, setSlotFinished } from "@/lib/preparation";

export async function finishSlot(formData: FormData): Promise<void> {
  const id = text(formData, "id");
  const finished = text(formData, "finished");
  if (!id || !["true", "false"].includes(finished)) return;
  await setSlotFinished(prisma, await ownerId(), id, finished === "true");
  refreshPreparation();
}

export async function addSelectedEquipment(formData: FormData): Promise<void> {
  const checklistId = text(formData, "checklistId");
  const ids = formData.getAll("equipmentIds").filter((id): id is string => typeof id === "string" && id.length > 0);
  if (!checklistId || !ids.length) return;
  const owner = await ownerId();
  await prisma.$transaction(tx => pickEquipment(tx, owner, checklistId, ids));
  refreshPreparation();
}

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

function refreshPreparation(): void {
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

export async function createChecklist(formData: FormData): Promise<void> {
  const parsed = checklistSchema.safeParse({
    name: text(formData, "name"),
    shootDate: text(formData, "shootDate"),
    notes: text(formData, "notes")
  });
  if (!parsed.success) return;
  const shootDate = optionalShootDate(parsed.data.shootDate);
  if (shootDate === undefined) return;

  const checklist = await prisma.equipmentChecklist.create({
    data: {
      ownerId: await ownerId(),
      name: parsed.data.name,
      shootDate,
      notes: parsed.data.notes
    }
  });
  refreshPreparation();
  redirect("/" + await getLocale() + "/dashboard/preparation/equipment#checklist-" + checklist.id);
}

export async function deleteChecklist(formData: FormData): Promise<void> {
  const id = text(formData, "id");
  if (!id) return;
  await prisma.equipmentChecklist.deleteMany({
    where: { id, ownerId: await ownerId() }
  });
  refreshPreparation();
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
  refreshPreparation();
}

export async function toggleChecklistItem(formData: FormData): Promise<void> {
  const id = text(formData, "id");
  if (!id) return;
  await prisma.equipmentChecklistItem.updateMany({
    where: { id, checklist: { ownerId: await ownerId() } },
    data: { checked: text(formData, "checked") === "true" }
  });
  refreshPreparation();
}

export async function removeChecklistItem(formData: FormData): Promise<void> {
  const id = text(formData, "id");
  if (!id) return;
  await prisma.equipmentChecklistItem.deleteMany({
    where: { id, checklist: { ownerId: await ownerId() } }
  });
  refreshPreparation();
}

export async function resetChecklist(formData: FormData): Promise<void> {
  const checklistId = text(formData, "checklistId");
  if (!checklistId) return;
  await prisma.equipmentChecklistItem.updateMany({
    where: { checklistId, checklist: { ownerId: await ownerId() } },
    data: { checked: false }
  });
  refreshPreparation();
}

export async function createDailyEquipmentChecklist(
  formData: FormData
): Promise<void> {
  const locale = await getLocale();
  const user = await requireUser(locale);
  const bookingDayId = formData.get("bookingDayId");
  if (typeof bookingDayId !== "string" || !bookingDayId) return;

  const day = await prisma.bookingDay.findFirst({
    where: { id: bookingDayId, bookingEvent: { ownerId: user.id } },
    include: {
      bookingEvent: { select: { titleEn: true, titleZh: true } }
    }
  });
  if (!day) return;

  const eventTitle = pickText(
    locale,
    day.bookingEvent.titleEn,
    day.bookingEvent.titleZh
  );
  const date = day.date.toISOString().slice(0, 10);
  const name = `${eventTitle} · ${date}`.slice(0, 160);

  const checklist = await prisma.equipmentChecklist.upsert({
    where: { bookingDayId: day.id },
    update: {},
    create: {
      ownerId: user.id,
      bookingDayId: day.id,
      name,
      shootDate: day.date
    }
  });
  revalidatePath("/", "layout");
  redirect(`/${locale}/dashboard/preparation/equipment?event=${day.bookingEventId}#checklist-${checklist.id}`);
}
