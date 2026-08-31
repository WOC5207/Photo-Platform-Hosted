import "server-only";
import { randomInt } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "./db";

/**
 * Password changes: the admin's reset, and an account's own change.
 *
 * Both funnel through here so the hashing cost and the minimum length are
 * decided once. A plaintext password never leaves this module except as the
 * return value of generateTemporaryPassword, which its caller shows to the
 * admin once and does not store.
 */

// Matches the cost used when accounts are created (auth.ts, register).
const BCRYPT_ROUNDS = 12;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;
export const PASSWORD_MAX_BYTES = 72;

/** bcrypt truncates after 72 UTF-8 bytes, so reject ambiguous credentials. */
export function passwordFitsHashLimit(plain: string): boolean {
  return Buffer.byteLength(plain, "utf8") <= PASSWORD_MAX_BYTES;
}

export async function hashPassword(plain: string): Promise<string> {
  if (!passwordFitsHashLimit(plain)) {
    throw new RangeError(
      `Password must be at most ${PASSWORD_MAX_BYTES} UTF-8 bytes.`
    );
  }
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/**
 * Unambiguous alphabet: no O/0, l/1/I. These get read off a screen and typed
 * back in by someone who did not choose them, and "was that an ell or a one"
 * is a support message the admin has to answer.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const TEMP_LENGTH = 20;

/**
 * A strong random password for an admin reset.
 *
 * randomInt, not Math.random: this is a credential, and Math.random is
 * predictable from prior outputs. randomInt is also free of the modulo bias a
 * naive `% ALPHABET.length` over random bytes would introduce.
 *
 * 20 characters from a 55-character alphabet is ~115 bits — far past anything
 * bcrypt-at-cost-12 needs, and it costs nothing to be generous when no human
 * has to invent or remember it.
 */
export function generateTemporaryPassword(): string {
  let out = "";
  for (let i = 0; i < TEMP_LENGTH; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

/** Hash and store. The only writer of passwordHash outside registration. */
export async function setPassword(
  userId: string,
  plain: string
): Promise<number> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(plain),
      credentialVersion: { increment: 1 }
    },
    select: { credentialVersion: true }
  });
  return user.credentialVersion;
}

/**
 * Replace an account's password, having proved the old one.
 *
 * Returns the new credential version, or null for a wrong current password, so
 * the caller can refresh only the browser that authorized the change.
 */
export async function changeOwnPassword(
  userId: string,
  currentPlain: string,
  nextPlain: string
): Promise<number | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;
  if (!(await bcrypt.compare(currentPlain, user.passwordHash))) return null;
  return setPassword(userId, nextPlain);
}
