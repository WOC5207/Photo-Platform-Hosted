import { getTranslations, getLocale } from "next-intl/server";
import { prisma } from "@/lib/db";
import { ownerBasePath, resolveOwner } from "@/lib/owner";
import { pickText, formatCredits } from "@/lib/content";
import { photoUrls, siteImageUrl } from "@/lib/images";
import { formatDate, formatDateRange } from "@/lib/datetime";
import { Link } from "@/i18n/navigation";
import {
  getSiteSettings,
  getAnnouncements,
  getPersonalLinks,
  resolveHomeTitle,
  resolveCreditTerm,
  resolveHomeCreditsLabel
} from "@/lib/settings";
import EventPhotoStream, {
  type StreamEvent
} from "@/components/EventPhotoStream";
import HomeHighlightsPanel, {
  type HighlightEventGroup,
  type HighlightAnnouncement
} from "@/components/HomeHighlightsPanel";
import HomeSearchBox from "@/components/HomeSearchBox";
import BookingCalendar, {
  type CalendarSession
} from "@/components/BookingCalendar";
import QuickStats from "@/components/QuickStats";
import PersonalLinksList, {
  type PersonalLinkItem
} from "@/components/PersonalLinksList";

// Reads site settings + published events from the DB at request time (the
// DB isn't available during the Docker build), like the other public pages.
export const dynamic = "force-dynamic";

export default async function HomePage({
  params
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const t = await getTranslations("home");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  const owner = await resolveOwner(username);
  const base = ownerBasePath(owner.username);
  const settings = await getSiteSettings(owner.id);

  const heroTitle = resolveHomeTitle(settings, locale, t("title"));
  const creditTerm = resolveCreditTerm(settings, locale, tc("creditTerm"));
  const defaultCreditsLabel = locale === "zh" ? creditTerm : `${creditTerm}s`;
  const creditsLabel = resolveHomeCreditsLabel(settings, locale, defaultCreditsLabel);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const [events, bookingEvents, personalLinks, announcements] = await Promise.all([
    prisma.event.findMany({
      where: { ownerId: owner.id, published: true },
      orderBy: [{ dateStart: "desc" }, { createdAt: "desc" }],
      include: {
        photos: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          include: { credits: { orderBy: { sortOrder: "asc" } } }
        }
      }
    }),
    settings.bookingEnabled
      ? prisma.bookingEvent.findMany({
          where: { ownerId: owner.id, open: true, date: { gte: today } },
          orderBy: [{ date: "asc" }, { createdAt: "asc" }],
          include: {
            slots: {
              include: {
                _count: {
                  select: { bookings: { where: { status: "confirmed" } } }
                }
              }
            }
          }
        })
      : Promise.resolve([]),
    getPersonalLinks(owner.id),
    getAnnouncements(owner.id)
  ]);

  // Derived from the already-loaded published events rather than extra count
  // queries — cheap in memory, and one fewer round-trip on the busiest page
  // (SQLite serves us over a single connection, so queries don't parallelize).
  const siteStats = {
    photoCount: events.reduce((n, e) => n + e.photos.length, 0),
    albumCount: events.length,
    creditCount: new Set(
      events.flatMap((e) =>
        e.photos.flatMap((p) =>
          p.credits.map((c) => c.creditName).filter((cn) => cn.length > 0)
        )
      )
    ).size
  };

  const calendarSessions: CalendarSession[] = bookingEvents.map((e) => ({
    date: formatDate(e.date),
    title: pickText(locale, e.titleEn, e.titleZh),
    token: e.token,
    remaining: e.slots.reduce(
      (n, s) => n + Math.max(0, s.capacity - s._count.bookings),
      0
    )
  }));

  const personalLinkItems: PersonalLinkItem[] = personalLinks.map((l) => ({
    id: l.id,
    label: pickText(locale, l.labelEn, l.labelZh) || l.url,
    url: l.url
  }));

  const streamEvents: StreamEvent[] = events
    .filter((e) => e.photos.length > 0)
    .map((e) => ({
      slug: e.slug,
      title: pickText(locale, e.titleEn, e.titleZh),
      date: formatDateRange(e.dateStart, e.dateEnd) || null,
      location: e.location,
      photos: e.photos.map((p) => ({
        id: p.id,
        url: photoUrls(e.id, p.id).med,
        alt: formatCredits(p.credits),
        width: p.width,
        height: p.height
      }))
    }));

  // The highlights panel only shows events that have at least one photo the
  // admin explicitly marked for it (Photo.homeHighlight, toggled per photo
  // in the event editor) — distinct from both the cover photo (gallery
  // listing thumbnail) and the full per-event stream shown below in
  // "Recent work". An event with none marked simply doesn't get a tab yet.
  const highlightEvents: HighlightEventGroup[] = events
    .flatMap((e) => {
      const selected = e.photos.filter((p) => p.homeHighlight);
      if (selected.length === 0) return [];
      return [
        {
          slug: e.slug,
          title: pickText(locale, e.titleEn, e.titleZh),
          dateLabel: formatDateRange(e.dateStart, e.dateEnd) || null,
          photos: selected.slice(0, 8).map((p) => ({
            id: p.id,
            url: photoUrls(e.id, p.id).med,
            caption: formatCredits(p.credits)
          }))
        }
      ];
    })
    .slice(0, 6);

  const announcementItems: HighlightAnnouncement[] = announcements.map((a) => ({
    id: a.id,
    title: pickText(locale, a.titleEn, a.titleZh),
    body: pickText(locale, a.bodyEn, a.bodyZh),
    imageUrl: siteImageUrl(a.image)
  }));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-6 px-2 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
        <div className="flex flex-col items-start gap-4">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            {heroTitle}
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`${base}/gallery`}
              className="rounded-full bg-fg px-5 py-2.5 text-sm font-semibold text-page transition hover:opacity-90"
            >
              {t("browseGallery")}
            </Link>
            {settings.bookingEnabled && (
              <Link
                href={`${base}/booking`}
                className="rounded-full border border-border-strong px-5 py-2.5 text-sm font-semibold text-fg-muted transition hover:border-fg-faint hover:text-fg"
              >
                {t("bookingButton")}
              </Link>
            )}
          </div>
        </div>

        <HomeSearchBox
          owner={owner.username}
          locale={locale}
          className="w-full lg:w-[26rem] lg:shrink-0"
          labels={{
            placeholder: t("searchPlaceholder"),
            searching: t("searching"),
            noResults: t("noSearchResults")
          }}
        />
      </div>

      <HomeHighlightsPanel
          basePath={base}
        events={highlightEvents}
        announcements={announcementItems}
        announcementsEnabled={settings.announcementsEnabled}
        labels={{
          announcementsTab: t("announcementsTab"),
          noAnnouncements: t("noAnnouncements"),
          viewGallery: t("viewGallery"),
          carouselPrevious: t("carouselPrevious"),
          carouselNext: t("carouselNext")
        }}
      />

      <div className="grid gap-8 lg:grid-cols-[1fr_320px] lg:items-start">
        <section className="flex flex-col gap-6 rounded-2xl border border-fg/10 bg-page/85 p-6 sm:p-8">
          {streamEvents.length > 0 && (
            <>
              <h2 className="text-2xl font-bold">{t("recentWork")}</h2>
              <EventPhotoStream basePath={base} events={streamEvents} />
            </>
          )}
        </section>

        <aside className="order-first flex flex-col gap-6 lg:order-none">
          {settings.bookingEnabled && (
            <BookingCalendar basePath={base} sessions={calendarSessions} />
          )}
          <QuickStats
            stats={siteStats}
            title={t("quickStatsTitle")}
            photosLabel={t("quickStatsPhotos")}
            albumsLabel={t("quickStatsAlbums")}
            creditsLabel={creditsLabel}
          />
          <PersonalLinksList
            items={personalLinkItems}
            title={t("personalLinksTitle")}
          />
        </aside>
      </div>
    </div>
  );
}
