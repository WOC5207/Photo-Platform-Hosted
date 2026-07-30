import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { pickText } from "@/lib/content";

export interface SiteSettings {
  id: string;
  ownerId: string;
  siteTitleEn: string;
  siteTitleZh: string;
  homeTitleEn: string;
  homeTitleZh: string;
  homeSubtitleEn: string;
  homeSubtitleZh: string;
  backgroundColor: string;
  surfaceColor: string;
  fieldColor: string;
  textColor: string;
  themeColor: string;
  darkBackgroundColor: string;
  darkSurfaceColor: string;
  darkFieldColor: string;
  darkTextColor: string;
  darkThemeColor: string;
  backgroundImage: string;
  logo: string;
  creditTermEn: string;
  creditTermZh: string;
  subjectTermEn: string;
  subjectTermZh: string;
  homeCreditsLabelEn: string;
  homeCreditsLabelZh: string;
  bookingEnabled: boolean;
  bookingPriceEnabled: boolean;
  bookingPriceNoticeAcceptedVersion: number | null;
  bookingPriceNoticeAcceptedLocale: string | null;
  bookingPriceNoticeAcceptedAt: Date | null;
  timeZone: string;
  lotteryEnabled: boolean;
  creditProfilesEnabled: boolean;
  announcementsEnabled: boolean;
  miniappEnabled: boolean;
  contactEnabled: boolean;
  contactTitleEn: string;
  contactTitleZh: string;
  contactUrlEn: string;
  contactUrlZh: string;
  contactQrImageEn: string;
  contactQrImageZh: string;
  setupCompleted: boolean;
}

const DEFAULTS: Omit<SiteSettings, "id" | "ownerId"> = {
  siteTitleEn: "",
  siteTitleZh: "",
  homeTitleEn: "",
  homeTitleZh: "",
  homeSubtitleEn: "",
  homeSubtitleZh: "",
  backgroundColor: "",
  surfaceColor: "",
  fieldColor: "",
  textColor: "",
  themeColor: "",
  darkBackgroundColor: "",
  darkSurfaceColor: "",
  darkFieldColor: "",
  darkTextColor: "",
  darkThemeColor: "",
  backgroundImage: "",
  logo: "",
  creditTermEn: "",
  creditTermZh: "",
  subjectTermEn: "",
  subjectTermZh: "",
  homeCreditsLabelEn: "",
  homeCreditsLabelZh: "",
  bookingEnabled: true,
  bookingPriceEnabled: false,
  bookingPriceNoticeAcceptedVersion: null,
  bookingPriceNoticeAcceptedLocale: null,
  bookingPriceNoticeAcceptedAt: null,
  timeZone: "UTC",
  lotteryEnabled: true,
  creditProfilesEnabled: true,
  announcementsEnabled: true,
  miniappEnabled: false,
  contactEnabled: false,
  contactTitleEn: "",
  contactTitleZh: "",
  contactUrlEn: "",
  contactUrlZh: "",
  contactQrImageEn: "",
  contactQrImageZh: "",
  setupCompleted: false
};

/**
 * One user's settings row, cached per-request so a layout and its page can both
 * read it without a duplicate query. cache() keys on the argument, so asking
 * for two different owners in one request still does the right thing.
 *
 * Returns defaults before the owner has saved anything — the row is created
 * with the account, but a user who has never opened Settings still has every
 * field at its default, and callers want a usable object either way.
 */
export const getSiteSettings = cache(
  async (ownerId: string): Promise<SiteSettings> => {
    const row = await prisma.siteSettings.findUnique({ where: { ownerId } });
    return row ?? { id: "", ownerId, ...DEFAULTS };
  }
);

/**
 * Resolve the site's brand title for a locale, falling back to the other
 * language and finally to the caller-supplied default (the i18n siteName).
 */
export function resolveSiteTitle(
  settings: SiteSettings,
  locale: string,
  fallback: string
): string {
  return pickText(locale, settings.siteTitleEn, settings.siteTitleZh) || fallback;
}

/**
 * Resolve the homepage hero headline for a locale, falling back to the other
 * language and finally to the caller-supplied default (the i18n copy).
 */
export function resolveHomeTitle(
  settings: SiteSettings,
  locale: string,
  fallback: string
): string {
  return pickText(locale, settings.homeTitleEn, settings.homeTitleZh) || fallback;
}

/** Same as resolveHomeTitle, for the hero subtitle. */
export function resolveHomeSubtitle(
  settings: SiteSettings,
  locale: string,
  fallback: string
): string {
  return (
    pickText(locale, settings.homeSubtitleEn, settings.homeSubtitleZh) || fallback
  );
}

/**
 * Resolve the vocabulary term for "the person credited in a photo" (e.g. an
 * operator running a cosplay-photography site might override this to
 * "Cosplayer"), falling back to the caller-supplied i18n default.
 */
export function resolveCreditTerm(
  settings: SiteSettings,
  locale: string,
  fallback: string
): string {
  return pickText(locale, settings.creditTermEn, settings.creditTermZh) || fallback;
}

/** Same as resolveCreditTerm, for the "subject" (character/role/theme) concept. */
export function resolveSubjectTerm(
  settings: SiteSettings,
  locale: string,
  fallback: string
): string {
  return pickText(locale, settings.subjectTermEn, settings.subjectTermZh) || fallback;
}

/**
 * Resolve the homepage quick-stats label for the credited-person count,
 * independent from the credit term used elsewhere (photo editor, booking
 * form) — falls back to the caller-supplied default (typically the credit
 * term, pluralized) when no override is set.
 */
export function resolveHomeCreditsLabel(
  settings: SiteSettings,
  locale: string,
  fallback: string
): string {
  return (
    pickText(locale, settings.homeCreditsLabelEn, settings.homeCreditsLabelZh) ||
    fallback
  );
}

/** Same as resolveHomeTitle, for the "Contact us" card heading. */
export function resolveContactTitle(
  settings: SiteSettings,
  locale: string,
  fallback: string
): string {
  return pickText(locale, settings.contactTitleEn, settings.contactTitleZh) || fallback;
}

/**
 * Resolve the "Contact us" link for a locale. Unlike resolveContactTitle,
 * this does NOT fall back to the other language — a WeChat link configured
 * only for the Chinese site shouldn't surface on the English one just
 * because nothing else is set there. Empty means no contact method for
 * that locale.
 */
export function resolveContactUrl(settings: SiteSettings, locale: string): string {
  return locale === "zh" ? settings.contactUrlZh : settings.contactUrlEn;
}

/** Same as resolveContactUrl, for the QR code image token. */
export function resolveContactQrToken(settings: SiteSettings, locale: string): string {
  return locale === "zh" ? settings.contactQrImageZh : settings.contactQrImageEn;
}

/** One owner's links to their other sites/profiles. */
export const getPersonalLinks = cache(async (ownerId: string) => {
  return prisma.personalLink.findMany({
    where: { ownerId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
  });
});

/** One owner's notices, shown in their homepage panel's Announcements tab. */
export const getAnnouncements = cache(async (ownerId: string) => {
  return prisma.announcement.findMany({
    where: { ownerId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
  });
});

/**
 * One owner's remembered credited-person social-link profiles (see
 * syncCreditProfiles in src/lib/photoCredits.ts), used to prefill their
 * photo-credit editors so they don't retype a person's links on every photo.
 * Scoped per owner: this is a private address book, not a shared directory.
 */
export const getCreditProfiles = cache(async (ownerId: string) => {
  return prisma.creditProfile.findMany({
    where: { ownerId },
    include: { socialLinks: { orderBy: { sortOrder: "asc" } } },
    orderBy: { creditName: "asc" }
  });
});
