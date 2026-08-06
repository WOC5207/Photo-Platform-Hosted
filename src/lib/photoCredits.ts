import "server-only";
import { prisma } from "./db";
import { isSafeExternalHttpUrl } from "./externalUrl";

export interface CreditInput {
  creditName: string;
  subject: string;
  socialLinks: { platform: string; url: string }[];
}

function sanitizeSocialLinks(rawLinks: unknown): { platform: string; url: string }[] {
  if (!Array.isArray(rawLinks)) return [];
  return rawLinks
    .map((l): { platform: string; url: string } | null => {
      if (typeof l !== "object" || l === null) return null;
      const link = l as Record<string, unknown>;
      const platform = String(link.platform ?? "").trim().slice(0, 60);
      const url = String(link.url ?? "").trim().slice(0, 500);
      if (!platform || !url || !isSafeExternalHttpUrl(url)) return null;
      return { platform, url };
    })
    .filter((l): l is { platform: string; url: string } => l !== null)
    .slice(0, 10);
}

/** Same validation as the nested socialLinks array in parseCreditsJson, but
 * for a standalone JSON-encoded array (used by the credit-profile editor,
 * which edits a single credited person's social links independent of any
 * photo). */
export function parseSocialLinksJson(
  raw: FormDataEntryValue | null
): { platform: string; url: string }[] {
  if (typeof raw !== "string") return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  return sanitizeSocialLinks(parsed);
}

/**
 * Parses and sanitizes the JSON-encoded credits array the admin UI submits —
 * one object per credited person, each with an optional list of social
 * links. Nesting rules out the plain parallel-FormData-array approach used
 * before social links existed, so both the upload route and
 * updatePhotoCredits share this instead of re-deriving the same validation
 * twice.
 *
 * Malformed entries are dropped rather than erroring: this is best-effort
 * admin input, not a public API contract. Name is the only required field of
 * a credit; platform/URL are the only required fields of a social link.
 */
export function parseCreditsJson(raw: FormDataEntryValue | null): CreditInput[] {
  if (typeof raw !== "string") return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((entry): CreditInput | null => {
      if (typeof entry !== "object" || entry === null) return null;
      const e = entry as Record<string, unknown>;
      const creditName = String(e.creditName ?? "").trim().slice(0, 200);
      if (!creditName) return null;
      const subject = String(e.subject ?? "").trim().slice(0, 200);
      const socialLinks = sanitizeSocialLinks(e.socialLinks);

      return { creditName, subject, socialLinks };
    })
    .filter((c): c is CreditInput => c !== null)
    .slice(0, 20);
}

/**
 * Keeps each credited person's remembered social-link profile (the
 * `CreditProfile` / `CreditProfileSocialLink` tables) in sync with whatever
 * was just submitted for a photo credit, so the admin only has to type a
 * person's links once — the photo-credit editors prefill from this later.
 * Call after saving the actual PhotoCredit/SocialLink rows (those remain the
 * source of truth for what renders on the gallery; this is a best-effort
 * side store).
 *
 * Skips credits with no social links, so re-saving a photo without links
 * (e.g. editing just the subject) never wipes a previously saved profile.
 */
export async function syncCreditProfiles(
  ownerId: string,
  credits: CreditInput[]
): Promise<void> {
  for (const c of credits) {
    if (!c.creditName || c.socialLinks.length === 0) continue;

    const profile = await prisma.creditProfile.upsert({
      where: { ownerId_creditName: { ownerId, creditName: c.creditName } },
      create: { ownerId, creditName: c.creditName },
      update: {}
    });
    await prisma.$transaction([
      prisma.creditProfileSocialLink.deleteMany({ where: { creditProfileId: profile.id } }),
      prisma.creditProfileSocialLink.createMany({
        data: c.socialLinks.map((s, i) => ({
          creditProfileId: profile.id,
          platform: s.platform,
          url: s.url,
          sortOrder: i
        }))
      })
    ]);
  }
}
