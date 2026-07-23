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
  resolveHomeSubtitle,
  resolveCreditTerm,
  resolveSubjectTerm,
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
import { wallClockNow } from "@/lib/timeZone";

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
  const tg = await getTranslations("gallery");
  const locale = await getLocale();
  const owner = await resolveOwner(username);
  const base = ownerBasePath(owner.username);
  const settings = await getSiteSettings(owner.id);

  const heroTitle = resolveHomeTitle(settings, locale, t("title"));
  const heroSubtitle = resolveHomeSubtitle(settings, locale, t("subtitle"));
  const creditTerm = resolveCreditTerm(settings, locale, tc("creditTerm"));
  const subjectTerm = resolveSubjectTerm(settings, locale, tc("subjectTerm"));
  const defaultCreditsLabel = locale === "zh" ? creditTerm : `${creditTerm}s`;
  const creditsLabel = resolveHomeCreditsLabel(settings, locale, defaultCreditsLabel);

  const today = wallClockNow(settings.timeZone);
  today.setUTCHours(0, 0, 0, 0);
  const bookingNow = wallClockNow(settings.timeZone);

  const [
    events,
    highlightSourceEvents,
    bookingEvents,
    personalLinks,
    announcements,
    photoCount,
    albumCount,
    creditedNames
  ] = await Promise.all([
    prisma.event.findMany({
      where: {
        ownerId: owner.id,
        published: true,
        photos: { some: { pendingBatchId: null } }
      },
      orderBy: [{ dateStart: "desc" }, { createdAt: "desc" }],
      take: 6,
      include: {
        photos: {
          where: { pendingBatchId: null },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          take: 24,
          include: { credits: { orderBy: { sortOrder: "asc" } } }
        }
      }
    }),
    prisma.event.findMany({
      where: {
        ownerId: owner.id,
        published: true,
        photos: { some: { pendingBatchId: null, homeHighlight: true } }
      },
      orderBy: [{ dateStart: "desc" }, { createdAt: "desc" }],
      take: 6,
      include: {
        photos: {
          where: { pendingBatchId: null, homeHighlight: true },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          take: 8,
          include: { credits: { orderBy: { sortOrder: "asc" } } }
        }
      }
    }),
    settings.bookingEnabled
      ? prisma.bookingEvent.findMany({
          where: {
            ownerId: owner.id,
            open: true,
            days: { some: { date: { gte: today } } }
          },
          orderBy: [{ date: "asc" }, { createdAt: "asc" }],
          include: {
            days: {
              where: {
                date: { gte: today },
                slots: { some: { startTime: { gt: bookingNow } } }
              },
              orderBy: { date: "asc" },
              include: {
                slots: {
                  where: { startTime: { gt: bookingNow } },
                  include: {
                    _count: {
                      select: { bookings: { where: { status: "confirmed" } } }
                    }
                  }
                }
              }
            }
          }
        })
      : Promise.resolve([]),
    getPersonalLinks(owner.id),
    getAnnouncements(owner.id),
    prisma.photo.count({
      where: {
        pendingBatchId: null,
        event: { ownerId: owner.id, published: true }
      }
    }),
    prisma.event.count({
      where: { ownerId: owner.id, published: true }
    }),
    prisma.photoCredit.findMany({
      where: {
        creditName: { not: "" },
        photo: {
          pendingBatchId: null,
          event: { ownerId: owner.id, published: true }
        }
      },
      distinct: ["creditName"],
      select: { creditName: true }
    })
  ]);

  // Counts remain complete even though recent work is deliberately bounded for
  // photographers with large portfolios.
  const siteStats = {
    photoCount,
    albumCount,
    creditCount: creditedNames.length
  };

  // One calendar entry per future day of each open event, so a multi-day event
  // shows up on every day it runs.
  const calendarSessions: CalendarSession[] = bookingEvents.flatMap((e) =>
    e.days.map((day) => ({
      date: formatDate(day.date),
      title: pickText(locale, e.titleEn, e.titleZh),
      token: e.token,
      remaining: day.slots.reduce(
        (n, s) => n + Math.max(0, s.capacity - s._count.bookings),
        0
      )
    }))
  );

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
  const highlightEvents: HighlightEventGroup[] = highlightSourceEvents
    .flatMap((e) => {
      if (e.photos.length === 0) return [];
      return [
        {
          slug: e.slug,
          title: pickText(locale, e.titleEn, e.titleZh),
          dateLabel: formatDateRange(e.dateStart, e.dateEnd) || null,
          photos: e.photos.map((p) => ({
            id: p.id,
            url: photoUrls(e.id, p.id).med,
            caption: formatCredits(p.credits)
          }))
        }
      ];
    });

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
          <p className="max-w-2xl text-base text-fg-subtle sm:text-lg">
            {heroSubtitle}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`${base}/gallery`}
              className="inline-flex min-h-11 items-center rounded-full bg-fg px-5 py-2.5 text-sm font-semibold text-page transition hover:opacity-90"
            >
              {t("browseGallery")}
            </Link>
            {settings.bookingEnabled && (
              <Link
                href={`${base}/booking`}
                className="inline-flex min-h-11 items-center rounded-full border border-border-strong px-5 py-2.5 text-sm font-semibold text-fg-muted transition hover:border-fg-faint hover:text-fg"
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
            placeholder: t("searchPlaceholder", { creditTerm, subjectTerm }),
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
        {streamEvents.length > 0 && (
          <section className="flex flex-col gap-6 rounded-2xl border border-fg/10 bg-page/85 p-6 sm:p-8">
            <h2 className="text-2xl font-bold">{t("recentWork")}</h2>
            <EventPhotoStream
              basePath={base}
              events={streamEvents}
              openPhotoLabel={tg("openPhoto")}
            />
          </section>
        )}

        <aside
          className={`flex flex-col gap-6 ${streamEvents.length === 0 ? "lg:col-span-2 lg:grid lg:grid-cols-3" : ""}`}
        >
          {settings.bookingEnabled && (
            <BookingCalendar
              basePath={base}
              sessions={calendarSessions}
              timeZone={settings.timeZone}
            />
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
