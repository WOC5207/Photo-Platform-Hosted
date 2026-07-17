"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { redeemInvite } from "@/lib/invite";
import { usernameError } from "@/lib/username";
import { rateLimit } from "@/lib/rate-limit";

export type RegisterState = {
  error?:
    | "validation"
    | "usernameTaken"
    | "usernameReserved"
    | "usernameInvalid"
    | "usernameUppercase"
    | "mismatch"
    | "badInvite"
    | "rateLimited";
};

const registerSchema = z.object({
  username: z.string().trim().min(1).max(40),
  displayName: z.string().trim().max(80),
  password: z.string().min(8).max(500),
  confirmPassword: z.string().min(1).max(500)
});

export async function register(
  _prev: RegisterState,
  formData: FormData
): Promise<RegisterState> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
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

  const passwordHash = await bcrypt.hash(d.password, 12);

  // Locked and atomic; see redeemInvite for why.
  const result = await redeemInvite(code, {
    username: d.username,
    displayName: d.displayName,
    passwordHash
  });

  if (!result.ok) return { error: result.error };

  // Straight into their dashboard — the setup wizard takes it from here.
  const session = await getSession();
  session.userId = result.user.id;
  await session.save();

  const locale = await getLocale();
  redirect(`/${locale}/dashboard`);
}
