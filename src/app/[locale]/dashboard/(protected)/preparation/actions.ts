"use server";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { createOwnedChecklist, deleteOwnedChecklist, pickEquipment, setSlotFinished } from "@/lib/preparation";

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

const customItemSchema = z.string().trim().min(1).max(200);
const quickEquipmentStatusSchema = z.enum([
  "SIGNED_OUT",
  "IN_INVENTORY",
  "BROKEN"
]);

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

export async function createChecklist(formData: FormData): Promise<void> {
  const id = await createOwnedChecklist(await ownerId(), formData);
  if (!id) return;
  refreshPreparation();
  redirect("/" + await getLocale() + "/dashboard/preparation/equipment/" + id);
}

export async function deleteChecklist(formData: FormData): Promise<void> {
  const id = text(formData, "id");
  if (!id) return;
  const locale = await getLocale();
  const bookingEventId = await deleteOwnedChecklist(await ownerId(), id);
  if (bookingEventId === null) return;
  refreshPreparation();
  const eventQuery = bookingEventId ? `?event=${bookingEventId}` : "";
  redirect(`/${locale}/dashboard/preparation/equipment${eventQuery}`);
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

export async function removeChecklistItem(formData: FormData): Promise<void> {
  const id = text(formData, "id");
  if (!id) return;
  await prisma.equipmentChecklistItem.deleteMany({
    where: { id, checklist: { ownerId: await ownerId() } }
  });
  refreshPreparation();
}

export async function setChecklistEquipmentStatus(formData: FormData): Promise<void> {
  const checklistId = text(formData, "checklistId");
  const equipmentId = text(formData, "equipmentId");
  const parsed = quickEquipmentStatusSchema.safeParse(text(formData, "status"));
  if (!checklistId || !equipmentId || !parsed.success) return;
  const owner = await ownerId();

  const now = new Date();
  const eventState = {
    SIGNED_OUT: "AT_EVENT",
    IN_INVENTORY: "RETURNED",
    BROKEN: "BROKEN"
  } as const;

  await prisma.$transaction(async (tx) => {
    const member = await tx.equipmentChecklistItem.findFirst({
      where: {
        checklistId,
        equipmentId,
        checklist: { ownerId: owner }
      },
      select: { id: true }
    });
    if (!member) return;

    await Promise.all([
      tx.equipmentChecklistItem.update({
        where: { id: member.id },
        data: {
          eventState: eventState[parsed.data],
          ...(parsed.data === "SIGNED_OUT" ? { signedOutAt: now, returnedAt: null, brokenAt: null } : {}),
          ...(parsed.data === "IN_INVENTORY" ? { returnedAt: now } : {}),
          ...(parsed.data === "BROKEN" ? { brokenAt: now } : {})
        }
      }),
      tx.equipmentItem.updateMany({
        where: { id: equipmentId, ownerId: owner },
        data: { status: parsed.data }
      })
    ]);
  });
  refreshPreparation();
}
