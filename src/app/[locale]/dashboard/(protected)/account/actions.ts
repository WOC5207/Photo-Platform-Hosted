"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { clientIp } from "@/lib/clientIp";
import { prisma } from "@/lib/db";
import {
  changeOwnPassword,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH
} from "@/lib/password";
import { rateLimit } from "@/lib/rate-limit";

export type UpdateProfileState = {
  error?: "validation";
  ok?: boolean;
  value?: string;
};

const profileSchema = z.object({
  displayName: z.string().trim().max(80)
});

export async function updateProfile(
  _prev: UpdateProfileState,
  formData: FormData
): Promise<UpdateProfileState> {
  const user = await requireUser(await getLocale());
  const parsed = profileSchema.safeParse({
    displayName: formData.get("displayName") ?? ""
  });
  if (!parsed.success) return { error: "validation" };

  await prisma.user.updateMany({
    where: { id: user.id },
    data: { displayName: parsed.data.displayName }
  });

  revalidatePath("/", "layout");
  return { ok: true, value: parsed.data.displayName };
}

export type ChangePasswordState = {
  error?: "validation" | "mismatch" | "wrongCurrent" | "rateLimited";
  ok?: boolean;
};

const schema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
  confirmPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH)
});

/**
 * Change your own password, having proved you know the current one.
 *
 * The current-password check is the whole security of this: a session cookie
 * alone must not be enough to change the credential it was issued against, or a
 * borrowed laptop becomes a permanent account takeover.
 *
 * Rate-limited despite already being behind a login, because this endpoint
 * verifies a password — an attacker with a stolen session could otherwise use
 * it to guess the current password offline-fast, which is exactly the thing the
 * login limiter exists to stop them doing at the front door.
 */
export async function changePassword(
  _prev: ChangePasswordState,
  formData: FormData
): Promise<ChangePasswordState> {
  const user = await requireUser(await getLocale());

  const ip = clientIp(await headers());
  if (!rateLimit(`password:${user.id}:${ip}`, { limit: 10, windowMs: 15 * 60 * 1000 })) {
    return { error: "rateLimited" };
  }

  const parsed = schema.safeParse({
    currentPassword: formData.get("currentPassword") ?? "",
    newPassword: formData.get("newPassword") ?? "",
    confirmPassword: formData.get("confirmPassword") ?? ""
  });
  if (!parsed.success) return { error: "validation" };

  const d = parsed.data;
  if (d.newPassword !== d.confirmPassword) return { error: "mismatch" };

  if (!(await changeOwnPassword(user.id, d.currentPassword, d.newPassword))) {
    return { error: "wrongCurrent" };
  }

  // The session stays valid on purpose: you are the one who just changed it,
  // and signing you out of the tab you did it in reads as a failure.
  return { ok: true };
}
