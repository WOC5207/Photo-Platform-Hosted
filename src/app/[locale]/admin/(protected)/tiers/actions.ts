"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

/**
 * Storage tiers: the named allowances accounts are put on.
 *
 * Platform-only, like everything else under /admin — these decide other
 * people's limits, so the guard is the whole of the authorisation.
 */
async function guard(): Promise<User> {
  return requireAdmin(await getLocale());
}

// 2 TiB, matching the per-account override bound. A limit beats an unbounded
// number typed into a form, and nothing a NAS holds comes close.
const QUOTA_MAX_GIB = 2048;

export type TierState = { error?: "validation" | "duplicate"; ok?: boolean };

const tierSchema = z.object({
  name: z.string().trim().min(1).max(60),
  quotaGib: z.coerce.number().finite().min(0).max(QUOTA_MAX_GIB)
});

function gibToBytes(gib: number): bigint {
  return BigInt(Math.round(gib * 1024 ** 3));
}

export async function createTier(
  _prev: TierState,
  formData: FormData
): Promise<TierState> {
  await guard();
  const parsed = tierSchema.safeParse({
    name: formData.get("name") ?? "",
    quotaGib: formData.get("quotaGib") ?? ""
  });
  if (!parsed.success) return { error: "validation" };

  try {
    await prisma.tier.create({
      data: {
        name: parsed.data.name,
        quotaBytes: gibToBytes(parsed.data.quotaGib)
      }
    });
  } catch {
    // Unique constraint on name — two tiers called "Pro" would be a coin flip
    // to tell apart on the assignment dropdown.
    return { error: "duplicate" };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateTier(formData: FormData): Promise<void> {
  await guard();
  const id = formData.get("id");
  if (typeof id !== "string") return;
  const parsed = tierSchema.safeParse({
    name: formData.get("name") ?? "",
    quotaGib: formData.get("quotaGib") ?? ""
  });
  if (!parsed.success) return;

  // Deliberately allowed to land below what accounts on this tier already use:
  // that is how an admin stops a whole tier growing without deleting anyone's
  // work. Nothing is removed — their uploads simply start being refused. Same
  // rule the per-account override has always had.
  await prisma.tier
    .update({
      where: { id },
      data: {
        name: parsed.data.name,
        quotaBytes: gibToBytes(parsed.data.quotaGib)
      }
    })
    .catch(() => {});
  revalidatePath("/", "layout");
}

/**
 * Promote a tier to be the default.
 *
 * Clear-then-set, in a transaction, because the database holds a PARTIAL unique
 * index over isDefault: two rows may never be true at once, so the old default
 * has to stop being one before the new one starts. There is no moment in
 * between where the platform has no default, because nothing else can read
 * mid-transaction.
 */
export async function setDefaultTier(formData: FormData): Promise<void> {
  await guard();
  const id = formData.get("id");
  if (typeof id !== "string") return;

  const target = await prisma.tier.findUnique({ where: { id } });
  if (!target || target.isDefault) return;

  await prisma
    .$transaction([
      prisma.tier.updateMany({
        where: { isDefault: true },
        data: { isDefault: false }
      }),
      prisma.tier.update({ where: { id }, data: { isDefault: true } })
    ])
    .catch(() => {});
  revalidatePath("/", "layout");
}

export type DeleteTierState = {
  error?: "isDefault" | "inUse";
  ok?: boolean;
};

/**
 * Delete a tier.
 *
 * Refused for the default — every account with no assignment resolves through
 * it, and an expired assignment falls back to it, so removing it would leave
 * the platform with no answer to "how much space does this account have". The
 * schema's fallback for that state is zero, which would refuse every upload on
 * the platform at once.
 *
 * Refused while accounts are on it, rather than silently moving them to the
 * default: that would change someone's limit as a side effect of tidying up.
 * Reassign them first, deliberately.
 */
export async function deleteTier(
  _prev: DeleteTierState,
  formData: FormData
): Promise<DeleteTierState> {
  await guard();
  const id = formData.get("id");
  if (typeof id !== "string") return {};

  const tier = await prisma.tier.findUnique({
    where: { id },
    include: { _count: { select: { users: true } } }
  });
  if (!tier) return {};
  if (tier.isDefault) return { error: "isDefault" };
  if (tier._count.users > 0) return { error: "inUse" };

  await prisma.tier.delete({ where: { id } }).catch(() => {});
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Put an account on a tier, optionally until a date.
 *
 * An empty tier means "the default", which is stored as NULL rather than as the
 * default tier's id: that way an account follows the default even if which tier
 * is default changes later, which is what "default" is supposed to mean.
 *
 * An expiry only makes sense against an explicit assignment — there is nothing
 * for the default to expire back to — so it is cleared alongside.
 */
export async function assignTier(formData: FormData): Promise<void> {
  await guard();
  const id = formData.get("id");
  const tierId = formData.get("tierId");
  const expiresAt = formData.get("expiresAt");
  if (typeof id !== "string") return;

  const resolvedTierId =
    typeof tierId === "string" && tierId !== "" ? tierId : null;

  let resolvedExpiry: Date | null = null;
  if (resolvedTierId && typeof expiresAt === "string" && expiresAt !== "") {
    // <input type="date"> gives YYYY-MM-DD. Take it as the END of that day, in
    // the server's zone: an admin who types today's date means "through today",
    // not "expired at midnight this morning".
    const parsed = new Date(`${expiresAt}T23:59:59`);
    if (!Number.isNaN(parsed.getTime())) resolvedExpiry = parsed;
  }

  await prisma.user
    .update({
      where: { id },
      data: { tierId: resolvedTierId, tierExpiresAt: resolvedExpiry }
    })
    .catch(() => {});
  revalidatePath("/", "layout");
}
