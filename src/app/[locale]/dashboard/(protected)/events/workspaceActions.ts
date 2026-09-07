"use server";
import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { addGalleryToBooking } from "@/lib/eventWorkspace";

export async function createGalleryForBooking(formData: FormData): Promise<void> {
  const locale = await getLocale();
  const user = await requireUser(locale);
  const id = formData.get("bookingId");
  if (typeof id !== "string" || !id) return;
  const galleryId = await prisma.$transaction(tx => addGalleryToBooking(tx, user.id, id, locale));
  if (!galleryId) return;
  revalidatePath("/", "layout");
  redirect("/" + locale + "/dashboard/events/" + galleryId);
}
