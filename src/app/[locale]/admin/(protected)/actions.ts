"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

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
 * Deletes an account and, by cascade, everything it owns.
 *
 * NOTE: this does not yet remove their files from disk — storage is still laid
 * out per event rather than per owner, so there is no single directory to
 * remove. That lands with the per-owner storage work, and must run BEFORE the
 * row is deleted: once it is gone the paths are unrecoverable and the files are
 * orphaned forever.
 */
export async function deleteUser(formData: FormData): Promise<void> {
  const admin = await guard();
  const id = formData.get("id");
  if (typeof id !== "string") return;
  if (id === admin.id) return;

  await prisma.user.delete({ where: { id } }).catch(() => {});
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
