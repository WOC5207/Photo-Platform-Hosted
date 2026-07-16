"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { deleteUserFiles } from "@/lib/images";
import { reconcileQuota } from "@/lib/quota";

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
}

const QUOTA_MIN = 0;
// 2 TiB — far past anything a NAS will hold, but a bound beats an unbounded
// number typed into a form.
const QUOTA_MAX = 2 * 1024 ** 4;

/** Sets one account's storage allowance. This is goal #5's actual control. */
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

/** Recomputes one account's usage counter from its rows. See reconcileQuota. */
export async function reconcileUserQuota(formData: FormData): Promise<void> {
  await guard();
  const id = formData.get("id");
  if (typeof id !== "string") return;
  await reconcileQuota(id).catch(() => {});
  revalidatePath("/", "layout");
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
