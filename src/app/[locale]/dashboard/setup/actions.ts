"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession, requireUser } from "@/lib/auth";
import { getSiteSettings } from "@/lib/settings";
import { completeOwnerSetup } from "@/lib/setup";
import { usernameError } from "@/lib/username";
import type { User } from "@prisma/client";
import {
  hashPassword,
  PASSWORD_MAX_LENGTH,
  passwordFitsHashLimit
} from "@/lib/password";

async function guard(): Promise<{ locale: string; user: User }> {
  const locale = await getLocale();
  const user = await requireUser(locale);
  const settings = await getSiteSettings(user.id);
  if (user.role === "admin" || settings.setupCompleted) {
    redirect(`/${locale}/dashboard`);
  }
  return { locale, user };
}

export type CredentialsState = {
  error?:
    | "validation"
    | "mismatch"
    | "wrongCurrent"
    | "notEligible"
    | "usernameUppercase"
    | "usernameInvalid"
    | "usernameReserved"
    | "usernameTaken"
    | "unknown";
  ok?: boolean;
};

const credentialsSchema = z.object({
  username: z.string().trim().min(1).max(40),
  currentPassword: z
    .string()
    .min(1)
    .max(PASSWORD_MAX_LENGTH)
    .refine(passwordFitsHashLimit),
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

/**
 * Replaces the signed-in user's username/password. Called from setup step 1 so
 * the admin stops relying on the ADMIN_USERNAME/ADMIN_PASSWORD placeholder that
 * seeded the account on first login (see ensureOwnerSeeded in src/lib/auth.ts)
 * — those env vars are only ever consulted for that initial seed, so this is
 * the one place a durable password gets set.
 *
 * Targets the current user rather than the first row in the table: with more
 * than one account, findFirst() would have rewritten a stranger's credentials.
 */
export async function setupUpdateCredentials(
  _prev: CredentialsState,
  formData: FormData
): Promise<CredentialsState> {
  const { user } = await guard();
  const parsed = credentialsSchema.safeParse({
    username: formData.get("username") ?? "",
    currentPassword: formData.get("currentPassword") ?? "",
    password: formData.get("password") ?? "",
    confirmPassword: formData.get("confirmPassword") ?? ""
  });
  if (!parsed.success) return { error: "validation" };
  const d = parsed.data;
  if (d.password !== d.confirmPassword) return { error: "mismatch" };
  const redeemedInvite = await prisma.invite.findUnique({
    where: { redeemedById: user.id },
    select: { id: true }
  });
  if (redeemedInvite) return { error: "notEligible" };
  if (/[A-Z]/.test(d.username)) return { error: "usernameUppercase" };
  const nameProblem = usernameError(d.username);
  if (nameProblem === "invalid") return { error: "usernameInvalid" };
  if (nameProblem === "reserved") return { error: "usernameReserved" };
  if (!(await bcrypt.compare(d.currentPassword, user.passwordHash))) {
    return { error: "wrongCurrent" };
  }

  try {
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        username: d.username,
        passwordHash: await hashPassword(d.password),
        credentialVersion: { increment: 1 }
      },
      select: { credentialVersion: true }
    });
    const session = await getSession();
    session.userId = user.id;
    session.credentialVersion = updated.credentialVersion;
    await session.save();
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return { error: "usernameTaken" };
    }
    return { error: "unknown" };
  }
  return { ok: true };
}

export type BrandState = { ok?: boolean };

export async function setupUpdateBrand(
  _prev: BrandState,
  formData: FormData
): Promise<BrandState> {
  const { user } = await guard();
  const siteTitleEn = String(formData.get("siteTitleEn") ?? "")
    .trim()
    .slice(0, 120);
  const siteTitleZh = String(formData.get("siteTitleZh") ?? "")
    .trim()
    .slice(0, 120);

  await prisma.siteSettings.upsert({
    where: { ownerId: user.id },
    create: { ownerId: user.id, siteTitleEn, siteTitleZh },
    update: { siteTitleEn, siteTitleZh }
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

export type HomeTextState = { ok?: boolean };

export async function setupUpdateHomeText(
  _prev: HomeTextState,
  formData: FormData
): Promise<HomeTextState> {
  const { user } = await guard();
  const homeTitleEn = String(formData.get("homeTitleEn") ?? "")
    .trim()
    .slice(0, 200);
  const homeTitleZh = String(formData.get("homeTitleZh") ?? "")
    .trim()
    .slice(0, 200);
  const homeSubtitleEn = String(formData.get("homeSubtitleEn") ?? "")
    .trim()
    .slice(0, 300);
  const homeSubtitleZh = String(formData.get("homeSubtitleZh") ?? "")
    .trim()
    .slice(0, 300);

  await prisma.siteSettings.upsert({
    where: { ownerId: user.id },
    create: {
      ownerId: user.id,
      homeTitleEn,
      homeTitleZh,
      homeSubtitleEn,
      homeSubtitleZh
    },
    update: { homeTitleEn, homeTitleZh, homeSubtitleEn, homeSubtitleZh }
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

export type FeaturesState = { ok?: boolean };

export async function setupUpdateFeatures(
  _prev: FeaturesState,
  formData: FormData
): Promise<FeaturesState> {
  const { user } = await guard();
  const bookingEnabled = formData.get("bookingEnabled") === "on";
  const lotteryEnabled =
    bookingEnabled && formData.get("lotteryEnabled") === "on";
  const creditProfilesEnabled = formData.get("creditProfilesEnabled") === "on";

  await prisma.siteSettings.upsert({
    where: { ownerId: user.id },
    create: {
      ownerId: user.id,
      bookingEnabled,
      lotteryEnabled,
      creditProfilesEnabled
    },
    update: { bookingEnabled, lotteryEnabled, creditProfilesEnabled }
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Final wizard step: seeds a draft album (and a draft booking event, if the
 * booking feature was enabled) so the admin lands on a dashboard with
 * something to look at instead of an empty shell, then marks setup done so
 * the (protected) layout stops redirecting here.
 */
export async function completeSetup(): Promise<void> {
  const { locale, user } = await guard();
  await completeOwnerSetup(user.id);

  revalidatePath("/", "layout");
  redirect(`/${locale}/dashboard`);
}
