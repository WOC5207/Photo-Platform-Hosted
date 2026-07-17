"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { deleteUserFiles } from "@/lib/images";
import { reconcileQuota } from "@/lib/quota";
import { generateTemporaryPassword, setPassword } from "@/lib/password";

/**
 * Platform administration. Unlike the dashboard actions — which are scoped to
 * the signed-in owner — these act on OTHER people's accounts by design, so the
 * guard is the whole of the authorisation and role is checked on every call.
 */
async function guard(): Promise<User> {
  return requireAdmin(await getLocale());
}

/**
 * Suspending hides an account's public site immediately and kills its session
 * on the next request (see getCurrentUser) — no cookie hunting needed.
 */
export async function setUserStatus(formData: FormData): Promise<void> {
  const admin = await guard();
  const id = formData.get("id");
  const status = formData.get("status");
  if (
    typeof id !== "string" ||
    (status !== "active" && status !== "suspended")
  ) {
    return;
  }
  // Locking yourself out of the only admin account would leave the platform
  // unadministrable, and nothing else can undo it.
  if (id === admin.id) return;

  await prisma.user.update({ where: { id }, data: { status } }).catch(() => {});
  revalidatePath("/", "layout");
}

/**
 * Deletes an account, its files, and by cascade everything it owns.
 *
 * Files first, deliberately. The row is what tells us where the files are, so
 * deleting it first would leave them on disk with nothing pointing at them —
 * unrecoverable, and invisible to every tool here. Doing it this way round can
 * instead leave an account with no files if the DB delete fails, which is
 * recoverable: the admin simply deletes it again.
 */
export async function deleteUser(formData: FormData): Promise<void> {
  const admin = await guard();
  const id = formData.get("id");
  if (typeof id !== "string") return;
  if (id === admin.id) return;

  await deleteUserFiles(id);
  await prisma.user.delete({ where: { id } }).catch(() => {});
  revalidatePath("/", "layout");
  // Back to the list: this is submitted from the account's own detail page,
  // which stops existing the moment the delete lands.
  redirect(`/${await getLocale()}/admin`);
}

const QUOTA_MIN = 0;
// 2 TiB — far past anything a NAS will hold, but a bound beats an unbounded
// number typed into a form.
const QUOTA_MAX = 2 * 1024 ** 4;

/**
 * Overrides one account's storage allowance, ignoring its tier.
 *
 * The exception, not the rule: tiers are how allowances are normally set, and
 * an override is for the one account that needs a different number without a
 * tier being invented for it. Clearing it (clearUserQuotaOverride) puts the
 * account back on whatever its tier grants.
 */
export async function setUserQuota(formData: FormData): Promise<void> {
  await guard();
  const id = formData.get("id");
  const gib = Number(formData.get("quotaGib"));
  if (typeof id !== "string") return;
  if (!Number.isFinite(gib) || gib < 0) return;

  const bytes = Math.round(gib * 1024 ** 3);
  if (bytes < QUOTA_MIN || bytes > QUOTA_MAX) return;

  // Deliberately allowed to land below the account's current usage: that is how
  // an admin stops someone growing further without deleting their work. Nothing
  // is removed — uploads simply start failing until they free space.
  await prisma.user
    .update({ where: { id }, data: { quotaBytes: BigInt(bytes) } })
    .catch(() => {});
  revalidatePath("/", "layout");
}

/** Drops the override so the account follows its tier again. */
export async function clearUserQuotaOverride(formData: FormData): Promise<void> {
  await guard();
  const id = formData.get("id");
  if (typeof id !== "string") return;
  await prisma.user
    .update({ where: { id }, data: { quotaBytes: null } })
    .catch(() => {});
  revalidatePath("/", "layout");
}

/** Recomputes one account's usage counter from its rows. See reconcileQuota. */
export async function reconcileUserQuota(formData: FormData): Promise<void> {
  await guard();
  const id = formData.get("id");
  if (typeof id !== "string") return;
  await reconcileQuota(id).catch(() => {});
  revalidatePath("/", "layout");
}

export type ResetPasswordState = {
  /** The generated password, returned to the admin's browser exactly once. */
  password?: string;
  username?: string;
  error?: "notFound";
};

/**
 * Reset an account's password to a generated one.
 *
 * The plaintext is returned to the caller's own form state and nothing else: it
 * is not stored, not logged, and not readable again. Losing it before passing it
 * on is not a problem — reset again and a new one replaces it.
 *
 * Generated rather than admin-chosen so that no one, including the admin, needs
 * to invent a password for someone else. It also means the admin's knowledge of
 * it is momentary rather than a value they picked and might reuse.
 *
 * Deliberately does NOT touch the account's session: the point is usually that
 * someone is locked out, and there is no reason to eject them if they happen to
 * still be signed in elsewhere. Suspend the account if that is the intent —
 * that is what suspend is for.
 */
export async function resetUserPassword(
  _prev: ResetPasswordState,
  formData: FormData
): Promise<ResetPasswordState> {
  await guard();
  const id = formData.get("id");
  if (typeof id !== "string") return { error: "notFound" };

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return { error: "notFound" };

  const password = generateTemporaryPassword();
  await setPassword(user.id, password);
  revalidatePath("/", "layout");
  return { password, username: user.username };
}

export type InviteState = { error?: "validation"; ok?: boolean };

const inviteSchema = z.object({
  note: z.string().trim().max(200)
});

export async function createInvite(
  _prev: InviteState,
  formData: FormData
): Promise<InviteState> {
  const admin = await guard();
  const parsed = inviteSchema.safeParse({ note: formData.get("note") ?? "" });
  if (!parsed.success) return { error: "validation" };

  await prisma.invite.create({
    data: {
      // The code IS the URL — it has to be unguessable, not merely unique.
      code: randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, ""),
      issuedById: admin.id,
      note: parsed.data.note
    }
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Revoking only makes sense before redemption; after that, suspend the user. */
export async function revokeInvite(formData: FormData): Promise<void> {
  await guard();
  const id = formData.get("id");
  if (typeof id !== "string") return;

  await prisma.invite
    .deleteMany({ where: { id, redeemedAt: null } })
    .catch(() => {});
  revalidatePath("/", "layout");
}
