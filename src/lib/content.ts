import { safeExternalHttpUrl } from "@/lib/externalUrl";

/**
 * Pick the best available text for a locale, falling back to the other
 * language rather than showing nothing.
 */
export function pickText(locale: string, en: string, zh: string): string {
  const ordered = locale === "zh" ? [zh, en] : [en, zh];
  return ordered.find((s) => s && s.trim().length > 0) ?? "";
}

/**
 * Format a photo's credit line (credited person + optional subject). These
 * are names, not translatable content, so the same string is shown on both
 * the zh and en sites.
 */
export function formatPhotoCredit(creditName: string, subject: string): string {
  if (!creditName) return subject;
  return subject ? `${creditName} · ${subject}` : creditName;
}

/**
 * Format a photo's full credit line from one or more (credited person,
 * subject) pairs — most photos have one, group shots have several.
 */
export function formatCredits(
  credits: { creditName: string; subject: string }[]
): string {
  return credits
    .map((c) => formatPhotoCredit(c.creditName, c.subject))
    .filter(Boolean)
    .join(", ");
}

/** One outbound profile link on an enlarged photo. */
export interface CreditSocialLink {
  /** The credited person the link belongs to (their CN). */
  name: string;
  /** The platform, e.g. "小红书". */
  label: string;
  url: string;
}

/**
 * Flatten a photo's credits into its profile links, keeping each link's
 * credited name so a group shot's identical platform buttons stay
 * distinguishable. Unsafe or empty URLs are dropped.
 */
export function creditSocialLinks(
  credits: { creditName: string; socialLinks: { platform: string; url: string }[] }[]
): CreditSocialLink[] {
  return credits.flatMap((c) =>
    c.socialLinks
      .map((link) => ({
        name: c.creditName.trim(),
        label: link.platform,
        url: safeExternalHttpUrl(link.url)
      }))
      .filter((link) => link.url !== "")
  );
}
