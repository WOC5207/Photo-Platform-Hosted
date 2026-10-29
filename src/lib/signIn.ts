import "server-only";
import { headers } from "next/headers";
import type { User } from "@prisma/client";
import { z } from "zod";
import { ensureOwnerSeeded, getSession, verifyCredentials } from "@/lib/auth";
import { clientIp } from "@/lib/clientIp";
import { rateLimit, refundRateLimit } from "@/lib/rate-limit";

/**
 * Failed sign-ins one account may take, from any number of addresses, before
 * it is paused. The per-address limit alone let many addresses keep guessing
 * one password. Each attempt counts while it is checked and a successful one
 * is handed back, so only failures fill it and parallel guesses can't all
 * slip in at once.
 */
export const ACCOUNT_SIGN_IN_LIMIT = { limit: 20, windowMs: 15 * 60 * 1000 };

export type SignInError = "invalid" | "rateLimited" | "notConfigured";

const signInSchema = z.object({
  username: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(500)
});

/**
 * Check a sign-in form and start the session, for the classic login page and
 * the 3D site's. Each caller decides where the account goes next.
 */
export async function signIn(formData: FormData): Promise<{ error: SignInError } | { user: User }> {
  const ip = clientIp(await headers());
  if (!rateLimit(`login:${ip}`, { limit: 10, windowMs: 15 * 60 * 1000 })) {
    return { error: "rateLimited" };
  }

  const parsed = signInSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password")
  });
  if (!parsed.success) return { error: "invalid" };
  const accountKey = `login-account:${parsed.data.username.toLowerCase()}`;
  if (!rateLimit(accountKey, ACCOUNT_SIGN_IN_LIMIT)) {
    return { error: "rateLimited" };
  }

  try {
    await ensureOwnerSeeded();
  } catch {
    refundRateLimit(accountKey);
    return { error: "notConfigured" };
  }

  const user = await verifyCredentials(parsed.data.username, parsed.data.password);
  // A suspended account fails as "invalid" rather than announcing its status:
  // whoever is typing the password may not be the account's owner.
  if (!user) return { error: "invalid" };
  refundRateLimit(accountKey);

  const session = await getSession();
  session.userId = user.id;
  session.credentialVersion = user.credentialVersion;
  await session.save();
  return { user };
}
