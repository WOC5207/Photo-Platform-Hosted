"use server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { equipmentContactSchema } from "@/lib/equipmentQr";
import { revalidatePath } from "next/cache";

export async function saveEquipmentContact(_: { message: string }, form: FormData) {
  const user = await getCurrentUser();
  if (!user) return { message: "unauthorized" };
  const result = equipmentContactSchema.safeParse(Object.fromEntries(
    ["equipmentContactMethod", "equipmentContactLabel", "equipmentContactValue"].map(k => [k, form.get(k) ?? ""])
  ));
  if (!result.success) return { message: "contactInvalid" };
  const data = result.data.equipmentContactValue ? result.data : { equipmentContactMethod: "", equipmentContactLabel: "", equipmentContactValue: "" };
  try {
    await prisma.siteSettings.upsert({ where: { ownerId: user.id }, create: { ownerId: user.id, ...data }, update: data });
    revalidatePath("/", "layout");
    return { message: "saved" };
  } catch { return { message: "failed" }; }
}
