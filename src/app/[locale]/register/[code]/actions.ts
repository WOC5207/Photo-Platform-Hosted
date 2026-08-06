"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { clientIp } from "@/lib/clientIp";
import { redeemInvite } from "@/lib/invite";
import { usernameError } from "@/lib/username";
import { rateLimit } from "@/lib/rate-limit";
import {
  hashPassword,
  PASSWORD_MAX_LENGTH,
  passwordFitsHashLimit
} from "@/lib/password";

export type RegisterState = {
  error?:
    | "validation"
    | "usernameTaken"
    | "usernameReserved"
    | "usernameInvalid"
    | "usernameUppercase"
    | "mismatch"
    | "badInvite"
    | "noticeChanged"
    | "consentRequired"
    | "rateLimited";
};

const registerSchema = z.object({
  username: z.string().trim().min(1).max(40),
  displayName: z.string().trim().max(80),
  password: z
    .string()
    .min(8)
    .max(PASSWORD_MAX_LENGTH)
    .refine(passwordFitsHashLimit),
  confirmPassword: z
    .string()
    .min(1)
    .max(PASSWORD_MAX_LENGTH)
    .refine(passwordFitsHashLimit)
});

export async function register(
  _prev: RegisterState,
  formData: FormData
): Promise<RegisterState> {
  const ip = clientIp(await headers());
  // The code is unguessable, but rate-limiting still stops someone hammering
  // this endpoint to probe which usernames exist.
  if (!rateLimit(`register:${ip}`, { limit: 10, windowMs: 15 * 60 * 1000 })) {
    return { error: "rateLimited" };
  }

  const code = formData.get("code");
  if (typeof code !== "string") return { error: "badInvite" };

  const parsed = registerSchema.safeParse({
    username: formData.get("username") ?? "",
    displayName: formData.get("displayName") ?? "",
    password: formData.get("password") ?? "",
    confirmPassword: formData.get("confirmPassword") ?? ""
  });
  if (!parsed.success) return { error: "validation" };
  const d = parsed.data;
  if (d.password !== d.confirmPassword) return { error: "mismatch" };

  if (/[A-Z]/.test(d.username)) return { error: "usernameUppercase" };
  const nameProblem = usernameError(d.username);
  if (nameProblem === "invalid") return { error: "usernameInvalid" };
  if (nameProblem === "reserved") return { error: "usernameReserved" };

  const passwordHash = await hashPassword(d.password);

  // Locked and atomic; see redeemInvite for why.
  const locale = await getLocale();
  const rawNoticeVersion = formData.get("noticeVersion");
  const noticeVersion =
    typeof rawNoticeVersion === "string" && /^\d+$/.test(rawNoticeVersion)
      ? Number(rawNoticeVersion)
      : null;
  const result = await redeemInvite(
    code,
    {
      username: d.username,
      displayName: d.displayName,
      passwordHash
    },
    {
      accepted: formData.get("consentAccepted") === "on",
      noticeVersion,
      locale
    }
  );

  if (!result.ok) return { error: result.error };

  // Straight into their dashboard — the setup wizard takes it from here.
  const session = await getSession();
  session.userId = result.user.id;
  session.credentialVersion = result.user.credentialVersion;
  await session.save();

  redirect(`/${locale}/dashboard`);
}
