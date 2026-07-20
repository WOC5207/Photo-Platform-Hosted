"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { dismissNotificationForUser } from "@/lib/platformNotifications";

/**
 * Dismiss one platform notification for the signed-in account. The dismissal
 * is stored per user (not per browser) so it holds across devices, and the
 * lib helper validates reach — a foreign or nonexistent id is a silent no-op.
 */
export async function dismissPlatformNotification(
  formData: FormData
): Promise<void> {
  const user = await requireUser(await getLocale());
  const notificationId = formData.get("notificationId");
  if (typeof notificationId !== "string" || notificationId.length === 0) return;

  await dismissNotificationForUser(user.id, notificationId);
  revalidatePath("/", "layout");
}
