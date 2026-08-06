"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { getSession, requireUser } from "@/lib/auth";
import { clientIp } from "@/lib/clientIp";
import { prisma } from "@/lib/db";
import {
  changeOwnPassword,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordFitsHashLimit
} from "@/lib/password";
import { rateLimit } from "@/lib/rate-limit";

export type UpdateProfileState = {
  error?: "validation";
  ok?: boolean;
  displayName?: string;
  email?: string;
};

const profileSchema = z.object({
  displayName: z.string().trim().max(80),
  // Optional. Empty means "no email, in-app notices only"; a non-empty value
  // must be a valid address (it is what booking alerts and announcements go to).
  email: z.string().trim().max(200).email().or(z.literal(""))
});

export async function updateProfile(
  _prev: UpdateProfileState,
  formData: FormData
): Promise<UpdateProfileState> {
  const user = await requireUser(await getLocale());
  const parsed = profileSchema.safeParse({
    displayName: formData.get("displayName") ?? "",
    email: formData.get("email") ?? ""
  });
  if (!parsed.success) return { error: "validation" };

  await prisma.user.updateMany({
    where: { id: user.id },
    data: { displayName: parsed.data.displayName, email: parsed.data.email }
  });

  revalidatePath("/", "layout");
  return {
    ok: true,
    displayName: parsed.data.displayName,
    email: parsed.data.email
  };
}

export type ChangePasswordState = {
  error?: "validation" | "mismatch" | "wrongCurrent" | "rateLimited";
  ok?: boolean;
};

const schema = z.object({
  currentPassword: z
    .string()
    .min(1)
    .max(PASSWORD_MAX_LENGTH)
    .refine(passwordFitsHashLimit),
  newPassword: z
    .string()
    .min(PASSWORD_MIN_LENGTH)
    .max(PASSWORD_MAX_LENGTH)
    .refine(passwordFitsHashLimit),
  confirmPassword: z
    .string()
    .min(1)
    .max(PASSWORD_MAX_LENGTH)
    .refine(passwordFitsHashLimit)
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

  const credentialVersion = await changeOwnPassword(
    user.id,
    d.currentPassword,
    d.newPassword
  );
  if (credentialVersion === null) {
    return { error: "wrongCurrent" };
  }

  // Re-issue this browser at the new version while every other previously
  // issued cookie becomes invalid on its next request.
  const session = await getSession();
  session.userId = user.id;
  session.credentialVersion = credentialVersion;
  await session.save();
  return { ok: true };
}
