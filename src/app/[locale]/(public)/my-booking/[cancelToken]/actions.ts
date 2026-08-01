"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { clientIp } from "@/lib/clientIp";
import { rateLimit } from "@/lib/rate-limit";
import { updatePublicBookingByToken } from "@/lib/publicBookingService";

export type EditBookingState = {
  ok?: boolean;
  error?:
    | "validation"
    | "rateLimited"
    | "notFound"
    | "disabled"
    | "cutoff"
    | "closed"
    | "slotUnavailable"
    | "slotFull";
};

const editBookingSchema = z.object({
  cancelToken: z.string().regex(/^[a-z0-9]+$/).max(100),
  targetSlotId: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  subject: z.string().trim().max(200),
  contactValue: z.string().trim().min(1).max(200),
  email: z.string().trim().max(200).email().or(z.literal("")),
  notes: z.string().trim().max(2000)
});

export async function updateMyBooking(
  _prev: EditBookingState,
  formData: FormData
): Promise<EditBookingState> {
  const parsed = editBookingSchema.safeParse({
    cancelToken: formData.get("cancelToken") ?? "",
    targetSlotId: formData.get("targetSlotId") ?? "",
    name: formData.get("name") ?? "",
    subject: formData.get("subject") ?? "",
    contactValue: formData.get("contactValue") ?? "",
    email: formData.get("email") ?? "",
    notes: formData.get("notes") ?? ""
  });
  if (!parsed.success) return { error: "validation" };

  const d = parsed.data;
  const ip = clientIp(await headers());
  if (
    !rateLimit(`book-update:${d.cancelToken}:${ip}`, {
      limit: 20,
      windowMs: 60 * 60 * 1000
    })
  ) {
    return { error: "rateLimited" };
  }

  const result = await updatePublicBookingByToken(d.cancelToken, {
    targetSlotId: d.targetSlotId,
    name: d.name,
    subject: d.subject,
    contactValue: d.contactValue,
    email: d.email,
    notes: d.notes
  });
  if (!result.ok) return { error: result.error };

  const locale = await getLocale();
  revalidatePath(`/${locale}/my-booking/${d.cancelToken}`);
  return { ok: true };
}
