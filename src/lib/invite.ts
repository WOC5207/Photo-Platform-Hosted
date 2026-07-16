import "server-only";
import type { User } from "@prisma/client";
import { prisma } from "./db";

export interface NewAccount {
  username: string;
  displayName: string;
  passwordHash: string;
}

export type RedeemResult =
  | { ok: true; user: User }
  | { ok: false; error: "badInvite" | "usernameTaken" };

/**
 * Turns an unredeemed invite into an account, as a single atomic unit.
 *
 * Lives here rather than inline in the server action so the concurrency
 * invariant it protects can be exercised directly by a test — the action needs
 * request context (headers, locale, session) and cannot be called from one.
 * Same reasoning as reserveSlot in src/lib/booking.ts.
 *
 * The SELECT ... FOR UPDATE holds the invite row for the rest of the
 * transaction, so two people opening the same shared link at once are
 * serialized and the second sees the first's redemption. Without it, Postgres'
 * READ COMMITTED lets both read the invite as unredeemed and both get an
 * account — one invite, two users, silently.
 */
export async function redeemInvite(
  code: string,
  account: NewAccount
): Promise<RedeemResult> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      { id: string; redeemedAt: Date | null; expiresAt: Date | null }[]
    >`SELECT id, "redeemedAt", "expiresAt" FROM "Invite" WHERE code = ${code} FOR UPDATE`;

    const invite = rows[0];
    if (!invite) return { ok: false, error: "badInvite" } as const;
    if (invite.redeemedAt) return { ok: false, error: "badInvite" } as const;
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      return { ok: false, error: "badInvite" } as const;
    }

    // Username uniqueness is enforced by the DB; this only turns the constraint
    // violation into a friendly message in the common case.
    const taken = await tx.user.findUnique({
      where: { username: account.username },
      select: { id: true }
    });
    if (taken) return { ok: false, error: "usernameTaken" } as const;

    const user = await tx.user.create({
      data: {
        username: account.username,
        displayName: account.displayName,
        passwordHash: account.passwordHash,
        role: "user",
        // Their site exists from the moment the account does, so they never hit
        // a 404 at their own URL while setting up.
        settings: { create: {} }
      }
    });

    await tx.invite.update({
      where: { id: invite.id },
      data: { redeemedAt: new Date(), redeemedById: user.id }
    });

    return { ok: true, user } as const;
  });
}
