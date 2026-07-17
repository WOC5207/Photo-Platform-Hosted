/**
 * Tier assignment rules that are worth testing on their own.
 *
 * No Next imports, deliberately: the server action that uses this cannot be
 * called from a test (revalidatePath needs a request context), and importing
 * anything from next/* here would drag React's context into the test process
 * and crash it. Same reason booking.ts and invite.ts exist.
 */

export interface Assignment {
  tierId: string | null;
  expiresAt: Date | null;
}

/**
 * What an admin's tier + expiry form actually means.
 *
 * Two rules live here:
 *
 * An empty tier means "the default", stored as NULL rather than the default
 * tier's id — so the account keeps following the default even if which tier is
 * default changes later. Storing the id would freeze today's default in place
 * and quietly stop being the default the day it was replaced.
 *
 * A date is the END of that day. <input type="date"> gives YYYY-MM-DD, and
 * `new Date("2026-08-01")` is midnight UTC — so an admin typing today's date
 * would find the tier had already lapsed this morning, which is not what
 * "expires today" means to anyone. Parsed in the server's zone, at 23:59:59.
 *
 * An expiry without a tier is dropped: there is nothing for the default tier to
 * lapse back to, so a date there would be a promise nothing keeps.
 */
export function resolveAssignment(
  tierId: unknown,
  expiresAt: unknown
): Assignment {
  const resolvedTierId =
    typeof tierId === "string" && tierId !== "" ? tierId : null;

  if (!resolvedTierId) return { tierId: null, expiresAt: null };

  if (typeof expiresAt !== "string" || expiresAt === "") {
    return { tierId: resolvedTierId, expiresAt: null };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) {
    return { tierId: resolvedTierId, expiresAt: null };
  }

  const parsed = new Date(`${expiresAt}T23:59:59`);
  if (Number.isNaN(parsed.getTime())) {
    return { tierId: resolvedTierId, expiresAt: null };
  }
  return { tierId: resolvedTierId, expiresAt: parsed };
}
