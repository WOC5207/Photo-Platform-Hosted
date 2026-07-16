import "server-only";
import { cache } from "react";
import { getIronSession, type IronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import type { User } from "@prisma/client";
import { prisma } from "./db";
import { config } from "./config";

/**
 * The cookie carries identity and nothing else.
 *
 * Deliberately NOT role or status: those are authority, and authority is read
 * fresh from the database on every request (see getCurrentUser). Caching them
 * here would mean suspending an account did nothing until its 7-day cookie
 * expired.
 */
export interface SessionData {
  userId?: string;
}

export async function getSession(): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(await cookies(), {
    password: config.sessionSecret(),
    cookieName: "session",
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 7 // 7 days
    }
  });
}

/**
 * The signed-in user, or null. Suspended accounts resolve to null, so a
 * suspension takes effect on the user's very next request without needing to
 * hunt down and invalidate their cookie.
 *
 * cache() dedupes the lookup across a layout, its page, and any actions within
 * one request — the same trick getSiteSettings uses.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const session = await getSession();
  if (!session.userId) return null;

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.status !== "active") return null;
  return user;
});

/** True only for the platform admin (you), not for ordinary account holders. */
export async function isAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  return user?.role === "admin";
}

/**
 * Where a signed-in user belongs. Both the login form and the login page's
 * already-signed-in check route through this, because they must agree: if the
 * login page sends someone to a page that bounces them back to the login page,
 * the two redirects loop forever and the user just sees a blank screen.
 *
 * Ordinary accounts have nowhere of their own to land yet — /admin is
 * admin-only — so they go to the public homepage. That becomes their dashboard
 * once the routing split lands.
 */
export function homePathFor(user: User, locale: string): string {
  return user.role === "admin" ? `/${locale}/admin` : `/${locale}`;
}

/**
 * Guard for pages and server actions that need any signed-in account.
 * (Locale-prefixed paths both exist, so a plain "/zh/..." fallback is fine.)
 */
export async function requireUser(locale: string = "zh"): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect(`/${locale}/login`);
  return user;
}

/** Guard for platform-admin-only pages and server actions. */
export async function requireAdmin(locale: string = "zh"): Promise<User> {
  const user = await requireUser(locale);
  if (user.role !== "admin") redirect(`/${locale}`);
  return user;
}

/**
 * First-run seeding: if no account exists yet, create the platform admin from
 * ADMIN_USERNAME / ADMIN_PASSWORD. Called before verifying a login.
 *
 * Guarded on the whole table being empty rather than on the admin being
 * missing, so it can never resurrect an admin account that was deliberately
 * removed while other accounts exist.
 */
export async function ensureOwnerSeeded(): Promise<void> {
  const count = await prisma.user.count();
  if (count > 0) return;

  const username = config.adminUsername();
  const password = config.adminPassword();
  if (!username || !password) {
    throw new Error(
      "No account exists and ADMIN_USERNAME / ADMIN_PASSWORD are not set."
    );
  }
  await prisma.user.create({
    data: {
      username,
      passwordHash: await bcrypt.hash(password, 12),
      role: "admin"
    }
  });
}

/**
 * Returns the user on a correct username/password, else null. Suspended
 * accounts are rejected here too, so a suspension also blocks fresh logins and
 * not just existing sessions.
 */
export async function verifyCredentials(
  username: string,
  password: string
): Promise<User | null> {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    // Constant-ish time: hash anyway so missing users take as long as bad passwords
    await bcrypt.compare(password, "$2a$12$C6UzMDM.H6dfI/f/IKcEeO7Y1r1qcYvfkq0ZC0mLpFvQ9CQxq3l4u");
    return null;
  }
  if (!(await bcrypt.compare(password, user.passwordHash))) return null;
  if (user.status !== "active") return null;
  return user;
}
