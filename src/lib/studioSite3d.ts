import "server-only";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { pickText } from "@/lib/content";
import { photoUrls, siteImageUrl } from "@/lib/images";
import { ownerName } from "@/lib/owner";
import { getPlatformSettings } from "@/lib/platformSettings";
import { getAnnouncements, getCreditProfiles, getPersonalLinks, getSiteSettings, resolveCreditTerm } from "@/lib/settings";
import { defaultSharingPosterComposition, parseSharingPosterComposition } from "@/lib/sharingPoster";
import { resolveSharingPosterPhotos } from "@/lib/sharingPosterData";
import { getOwnerStorage } from "@/lib/storage";
import { studioAccount } from "@/lib/studio3d";
import { supportedTimeZones } from "@/lib/timeZone";
import type { SharepostProject } from "@/components/album3d/creators/sharepost/SharepostStudio";
import type { StudioCredits, StudioPosters, StudioSite, StudioStorage } from "@/components/album3d/studio/types";

/**
 * The 3D Dashboard's reads for posters, credits, site settings and storage.
 * Writes go through the classic dashboard's server actions and its poster
 * API, which scope every change to the signed-in account.
 */

export async function loadStudioStorage(user: User, locale: string, untitled: string): Promise<StudioStorage> {
  const stats = await getOwnerStorage(user.id);
  return {
    account: studioAccount(user),
    usedBytes: stats.usedBytes,
    quotaBytes: stats.quotaBytes,
    photosBytes: stats.photosBytes,
    siteImagesBytes: stats.siteImagesBytes,
    events: stats.events.map((e) => ({
      id: e.id,
      title: pickText(locale, e.titleEn, e.titleZh) || untitled,
      bytes: e.bytes,
      photos: e.photoCount,
      pending: e.pendingPhotoCount
    }))
  };
}

export async function loadStudioCredits(user: User, locale: string, termFallback: string): Promise<StudioCredits> {
  const [settings, roster] = await Promise.all([getSiteSettings(user.id), getCreditProfiles(user.id)]);
  return {
    account: studioAccount(user),
    enabled: settings.creditProfilesEnabled,
    term: resolveCreditTerm(settings, locale, termFallback),
    profiles: roster.map((c) => ({
      id: c.id,
      name: c.creditName,
      links: c.socialLinks.map((s) => ({ platform: s.platform, url: s.url }))
    }))
  };
}

export async function loadStudioSite(user: User, locale: string, termFallback: string): Promise<StudioSite> {
  const [settings, platform, links, announcements] = await Promise.all([
    getSiteSettings(user.id),
    getPlatformSettings(),
    getPersonalLinks(user.id),
    getAnnouncements(user.id)
  ]);
  return {
    account: studioAccount(user),
    homeUrl: `/${locale}/u/${encodeURIComponent(user.username)}`,
    displayName: user.displayName,
    email: user.email ?? "",
    values: {
      siteTitleEn: settings.siteTitleEn,
      siteTitleZh: settings.siteTitleZh,
      homeTitleEn: settings.homeTitleEn,
      homeTitleZh: settings.homeTitleZh,
      homeSubtitleEn: settings.homeSubtitleEn,
      homeSubtitleZh: settings.homeSubtitleZh,
      backgroundColor: settings.backgroundColor,
      surfaceColor: settings.surfaceColor,
      fieldColor: settings.fieldColor,
      textColor: settings.textColor,
      themeColor: settings.themeColor,
      darkBackgroundColor: settings.darkBackgroundColor,
      darkSurfaceColor: settings.darkSurfaceColor,
      darkFieldColor: settings.darkFieldColor,
      darkTextColor: settings.darkTextColor,
      darkThemeColor: settings.darkThemeColor,
      dashboardThemeMode: settings.dashboardThemeMode,
      creditTermEn: settings.creditTermEn,
      creditTermZh: settings.creditTermZh,
      subjectTermEn: settings.subjectTermEn,
      subjectTermZh: settings.subjectTermZh,
      homeCreditsLabelEn: settings.homeCreditsLabelEn,
      homeCreditsLabelZh: settings.homeCreditsLabelZh,
      bookingEnabled: settings.bookingEnabled,
      bookingPriceEnabled: settings.bookingPriceEnabled,
      timeZone: settings.timeZone,
      lotteryEnabled: settings.bookingEnabled && settings.lotteryEnabled,
      creditProfilesEnabled: settings.creditProfilesEnabled,
      announcementsEnabled: settings.announcementsEnabled,
      contactEnabled: settings.contactEnabled,
      contactTitleEn: settings.contactTitleEn,
      contactTitleZh: settings.contactTitleZh,
      contactUrlEn: settings.contactUrlEn,
      contactUrlZh: settings.contactUrlZh
    },
    images: {
      logo: siteImageUrl(settings.logo),
      background: siteImageUrl(settings.backgroundImage),
      contactQrEn: siteImageUrl(settings.contactQrImageEn),
      contactQrZh: siteImageUrl(settings.contactQrImageZh)
    },
    links: links.map((l) => ({ id: l.id, labelEn: l.labelEn, labelZh: l.labelZh, url: l.url })),
    announcements: announcements.map((a) => ({
      id: a.id,
      titleEn: a.titleEn,
      titleZh: a.titleZh,
      bodyEn: a.bodyEn,
      bodyZh: a.bodyZh,
      imageUrl: siteImageUrl(a.image)
    })),
    priceNotice: {
      title: pickText(locale, platform.bookingPriceNoticeTitleEn, platform.bookingPriceNoticeTitleZh),
      body: pickText(locale, platform.bookingPriceNoticeBodyEn, platform.bookingPriceNoticeBodyZh),
      version: platform.bookingPriceNoticeVersion
    },
    timeZones: [settings.timeZone, ...supportedTimeZones().filter((zone) => zone !== settings.timeZone)],
    creditTerm: resolveCreditTerm(settings, locale, termFallback)
  };
}

/** Posters the rail carries; the classic list pages through the rest. */
const MAX_POSTERS = 60;

export async function loadStudioPosters(user: User, locale: string, adaptiveLabel: string): Promise<StudioPosters> {
  const rows = await prisma.sharingPoster.findMany({
    where: { ownerId: user.id },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: MAX_POSTERS + 1,
    select: { id: true, name: true, updatedAt: true, composition: true }
  });
  const formatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const fallback = defaultSharingPosterComposition(locale, ownerName(user));
  const posters = rows.slice(0, MAX_POSTERS).map((row) => ({ row, composition: parseSharingPosterComposition(row.composition, fallback) }));
  // Each poster's first photograph, from the owner's own photos only.
  const firstIds = posters.flatMap(({ composition }) => (composition.photos[0] ? [composition.photos[0].photoId] : []));
  const covers = new Map(
    (
      await prisma.photo.findMany({
        where: { id: { in: firstIds }, event: { ownerId: user.id } },
        select: { id: true, eventId: true }
      })
    ).map((photo) => [photo.id, photoUrls(photo.eventId, photo.id)])
  );
  return {
    account: studioAccount(user),
    more: rows.length > MAX_POSTERS,
    posters: posters.map(({ row, composition }) => ({
      id: row.id,
      name: row.name,
      photos: composition.photos.length,
      ratio: composition.ratio.adaptive ? adaptiveLabel : `${composition.ratio.width}:${composition.ratio.height}`,
      aspect: composition.ratio.width / composition.ratio.height || 0.8,
      updated: formatter.format(row.updatedAt),
      thumb: covers.get(composition.photos[0]?.photoId ?? "")?.thumb ?? "",
      cover: covers.get(composition.photos[0]?.photoId ?? "")?.med ?? ""
    }))
  };
}

/** One of the photographer's posters, for the 3D Sharepost editor; null when it isn't theirs. */
export async function loadStudioPoster(user: User, locale: string, id: string): Promise<SharepostProject | null> {
  const [project, events] = await Promise.all([
    prisma.sharingPoster.findFirst({ where: { id, ownerId: user.id }, select: { id: true, name: true, revision: true, composition: true } }),
    prisma.event.findMany({
      where: { ownerId: user.id },
      orderBy: [{ dateStart: "desc" }, { createdAt: "desc" }],
      select: { id: true, titleEn: true, titleZh: true }
    })
  ]);
  if (!project) return null;
  const composition = parseSharingPosterComposition(project.composition, defaultSharingPosterComposition(locale, ownerName(user)));
  return {
    id: project.id,
    username: user.username,
    name: project.name,
    revision: project.revision,
    composition,
    photos: await resolveSharingPosterPhotos(user.id, locale, composition),
    events: events.map((event) => ({ id: event.id, title: pickText(locale, event.titleEn, event.titleZh) }))
  };
}
