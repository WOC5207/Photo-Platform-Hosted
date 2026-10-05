"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import type { User } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { createEventFromForm, deleteOwnedBookingEvent, deleteOwnedEvent } from "@/lib/eventForms";
import { createOwnedChecklist, deleteOwnedChecklist } from "@/lib/preparation";

/**
 * The 3D Dashboard's own actions: the ones whose classic versions end on a
 * classic page. Everything else calls the classic dashboard's actions as
 * they are, since they already act only on the signed-in account.
 */

export type StudioEventState = { error?: "validation" | "priceNoticeRequired" | "unknown" };

async function guard(): Promise<{ locale: string; user: User }> {
  const locale = await getLocale();
  const user = await getCurrentUser();
  if (!user) redirect(`/${locale}/3d/login`);
  return { locale, user };
}

const studioPath = (locale: string, user: User, tail: string) =>
  `/${locale}/3d/u/${encodeURIComponent(user.username)}/studio${tail}`;

export async function createEvent3d(_prev: StudioEventState, formData: FormData): Promise<StudioEventState> {
  const { locale, user } = await guard();
  const result = await createEventFromForm(user, locale, formData);
  if ("error" in result) return { error: result.error };
  revalidatePath("/", "layout");
  redirect(studioPath(locale, user, `/events/${result.galleryId}`));
}

export async function deleteEvent3d(formData: FormData): Promise<void> {
  const { locale, user } = await guard();
  const id = formData.get("id");
  if (typeof id !== "string" || !(await deleteOwnedEvent(user.id, id))) return;
  revalidatePath("/", "layout");
  redirect(studioPath(locale, user, "/events"));
}

export async function deleteBookingEvent3d(formData: FormData): Promise<void> {
  const { locale, user } = await guard();
  const id = formData.get("id");
  if (typeof id !== "string" || !(await deleteOwnedBookingEvent(user, id))) return;
  revalidatePath("/", "layout");
  redirect(studioPath(locale, user, "/bookings"));
}

export async function createChecklist3d(formData: FormData): Promise<void> {
  const { locale, user } = await guard();
  const id = await createOwnedChecklist(user.id, formData);
  if (!id) return;
  revalidatePath("/", "layout");
  redirect(studioPath(locale, user, `/preparation/${encodeURIComponent(id)}`));
}

export async function deleteChecklist3d(formData: FormData): Promise<void> {
  const { locale, user } = await guard();
  const id = formData.get("id");
  if (typeof id !== "string") return;
  const bookingEventId = await deleteOwnedChecklist(user.id, id);
  if (bookingEventId === null) return;
  revalidatePath("/", "layout");
  redirect(studioPath(locale, user, `/preparation${bookingEventId ? `?event=${encodeURIComponent(bookingEventId)}` : ""}`));
}
