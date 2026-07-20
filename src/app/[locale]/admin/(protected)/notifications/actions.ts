"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

/**
 * Platform notifications: messages from the admin to tenant accounts, shown
 * as dismissible banners on each recipient's /dashboard.
 *
 * Platform-only, like everything else under /admin — the guard is the whole
 * of the authorisation.
 */
async function guard(): Promise<User> {
  return requireAdmin(await getLocale());
}

export type NotificationState = { error?: "validation"; ok?: boolean };

// Same bounds as Announcement titles/bodies: 300/5000.
const notificationSchema = z
  .object({
    titleEn: z.string().trim().max(300),
    titleZh: z.string().trim().max(300),
    bodyEn: z.string().trim().max(5000),
    bodyZh: z.string().trim().max(5000),
    audience: z.enum(["all", "selected"])
  })
  .refine((value) => value.titleEn.length > 0 || value.titleZh.length > 0);

export async function sendNotification(
  _prev: NotificationState,
  formData: FormData
): Promise<NotificationState> {
  await guard();
  const parsed = notificationSchema.safeParse({
    titleEn: formData.get("titleEn") ?? "",
    titleZh: formData.get("titleZh") ?? "",
    bodyEn: formData.get("bodyEn") ?? "",
    bodyZh: formData.get("bodyZh") ?? "",
    audience: formData.get("audience") ?? ""
  });
  if (!parsed.success) return { error: "validation" };

  let targetIds: string[] = [];
  if (parsed.data.audience === "selected") {
    const requested = Array.from(
      new Set(
        formData
          .getAll("targetIds")
          .filter((value): value is string => typeof value === "string")
      )
    );
    // Re-checked against real accounts so a stale or forged id cannot create
    // a dangling target row.
    const existing = await prisma.user.findMany({
      where: { id: { in: requested } },
      select: { id: true }
    });
    targetIds = existing.map((user) => user.id);
    if (targetIds.length === 0) return { error: "validation" };
  }

  await prisma.platformNotification.create({
    data: {
      titleEn: parsed.data.titleEn,
      titleZh: parsed.data.titleZh,
      bodyEn: parsed.data.bodyEn,
      bodyZh: parsed.data.bodyZh,
      audience: parsed.data.audience,
      targets: {
        create: targetIds.map((userId) => ({ userId }))
      }
    }
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

/** Retract a notification: it disappears from every recipient's dashboard. */
export async function deleteNotification(formData: FormData): Promise<void> {
  await guard();
  const id = formData.get("id");
  if (typeof id !== "string") return;

  // deleteMany, not delete: an id that no longer exists (double click, second
  // tab) is a no-op rather than an exception.
  await prisma.platformNotification.deleteMany({ where: { id } });
  revalidatePath("/", "layout");
}
