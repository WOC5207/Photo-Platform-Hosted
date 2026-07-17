"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "@/i18n/navigation";

export interface HighlightPhoto {
  id: string;
  url: string;
  caption: string;
}

export interface HighlightEventGroup {
  slug: string;
  title: string;
  dateLabel: string | null;
  photos: HighlightPhoto[];
}

export interface HighlightAnnouncement {
  id: string;
  title: string;
  body: string;
  imageUrl: string;
}

export interface HomeHighlightsLabels {
  announcementsTab: string;
  noAnnouncements: string;
  viewGallery: string;
  carouselPrevious: string;
  carouselNext: string;
}

const tabCls = (active: boolean) =>
  `min-h-11 shrink-0 truncate whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40 ${
    active ? "bg-fg text-page" : "text-fg-muted hover:bg-fg/5 hover:text-fg"
  }`;

/** One event's photos, paged through with prev/next arrows and dot indicators. */
function EventCarousel({
  basePath,
  event,
  labels
}: {
  /** Root of the owner's site, e.g. "/u/alice" — locale is added by Link. */
  basePath: string;
  event: HighlightEventGroup;
  labels: HomeHighlightsLabels;
}) {
  const [index, setIndex] = useState(0);
  const photo = event.photos[index];
  const hasMultiple = event.photos.length > 1;

  return (
    <div className="flex flex-col gap-3">
      <div className="group relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-surface sm:aspect-video">
        <Link href={`${basePath}/gallery/${event.slug}`} className="block h-full w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.url}
            alt={event.title}
            className="h-full w-full object-cover"
          />
          {photo.caption && (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent p-4 pt-10 opacity-100 transition-opacity duration-200 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
              <p className="truncate text-sm font-medium text-white">
                {photo.caption}
              </p>
            </div>
          )}
        </Link>
        {hasMultiple && (
          <>
            <button
              type="button"
              onClick={() =>
                setIndex(
                  (i) => (i - 1 + event.photos.length) % event.photos.length
                )
              }
              aria-label={labels.carouselPrevious}
              className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-page/80 text-lg text-fg shadow-lg backdrop-blur transition hover:bg-page focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => setIndex((i) => (i + 1) % event.photos.length)}
              aria-label={labels.carouselNext}
              className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-page/80 text-lg text-fg shadow-lg backdrop-blur transition hover:bg-page focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
            >
              ›
            </button>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {event.photos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={String(i + 1)}
              aria-current={i === index ? "true" : undefined}
              className="group flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40 sm:h-8 sm:w-8"
            >
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full transition ${
                  i === index ? "bg-fg" : "bg-fg/20 group-hover:bg-fg/40"
                }`}
              />
            </button>
          ))}
        </div>
        <Link
          href={`${basePath}/gallery/${event.slug}`}
          className="inline-flex min-h-11 items-center rounded-full border border-border-strong px-4 py-2 text-xs font-semibold text-fg-muted transition hover:border-fg-faint hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40 sm:min-h-8"
        >
          {labels.viewGallery}
        </Link>
      </div>
    </div>
  );
}

/**
 * Homepage panel: a left-side tab switcher — "Announcement" (default,
 * always first) plus one tab per highlighted event — with the content pane
 * showing either the announcements list or a photo carousel for whichever
 * event tab is active.
 */
export default function HomeHighlightsPanel({
  basePath,
  events,
  announcements,
  announcementsEnabled,
  labels
}: {
  /** Root of the owner's site, e.g. "/u/alice" — locale is added by Link. */
  basePath: string;
  events: HighlightEventGroup[];
  announcements: HighlightAnnouncement[];
  announcementsEnabled: boolean;
  labels: HomeHighlightsLabels;
}) {
  const [activeTab, setActiveTab] = useState<string>(
    announcementsEnabled ? "announcements" : (events[0]?.slug ?? "")
  );
  const tabSetId = useId();
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const activeEvent = events.find((e) => e.slug === activeTab);
  const showAnnouncements = announcementsEnabled && activeTab === "announcements";
  const tabIds = [
    ...(announcementsEnabled ? ["announcements"] : []),
    ...events.map((event) => event.slug)
  ];

  if (tabIds.length === 0) return null;

  function onTabKeyDown(e: KeyboardEvent<HTMLButtonElement>, id: string) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) {
      return;
    }
    e.preventDefault();
    const current = tabIds.indexOf(id);
    const nextIndex =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? tabIds.length - 1
          : e.key === "ArrowLeft" || e.key === "ArrowUp"
            ? (current - 1 + tabIds.length) % tabIds.length
            : (current + 1) % tabIds.length;
    const nextId = tabIds[nextIndex];
    setActiveTab(nextId);
    tabRefs.current[nextId]?.focus();
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-fg/10 bg-page/85">
      <div className="flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:gap-8">
        <div
          role="tablist"
          aria-orientation="horizontal"
          className="flex shrink-0 gap-2 overflow-x-auto lg:w-48 lg:flex-col lg:overflow-visible"
        >
          {announcementsEnabled && (
            <button
              ref={(node) => {
                tabRefs.current.announcements = node;
              }}
              type="button"
              role="tab"
              id={`${tabSetId}-tab-announcements`}
              aria-controls={`${tabSetId}-panel`}
              aria-selected={activeTab === "announcements"}
              tabIndex={activeTab === "announcements" ? 0 : -1}
              onClick={() => setActiveTab("announcements")}
              onKeyDown={(e) => onTabKeyDown(e, "announcements")}
              className={tabCls(activeTab === "announcements")}
            >
              {labels.announcementsTab}
            </button>
          )}
          {events.map((event) => (
            <button
              key={event.slug}
              ref={(node) => {
                tabRefs.current[event.slug] = node;
              }}
              type="button"
              role="tab"
              id={`${tabSetId}-tab-${event.slug}`}
              aria-controls={`${tabSetId}-panel`}
              aria-selected={activeTab === event.slug}
              tabIndex={activeTab === event.slug ? 0 : -1}
              onClick={() => setActiveTab(event.slug)}
              onKeyDown={(e) => onTabKeyDown(e, event.slug)}
              className={tabCls(activeTab === event.slug)}
            >
              {event.title}
            </button>
          ))}
        </div>

        <div
          id={`${tabSetId}-panel`}
          role="tabpanel"
          aria-labelledby={`${tabSetId}-tab-${activeTab}`}
          className="min-w-0 flex-1"
        >
          {showAnnouncements ? (
            announcements.length > 0 ? (
              <ul className="flex flex-col gap-3">
                {announcements.map((a) => (
                  <li
                    key={a.id}
                    className={`relative overflow-hidden rounded-xl border border-fg/10 bg-surface p-4 ${
                      a.imageUrl ? "min-h-[7rem]" : ""
                    }`}
                  >
                    {a.imageUrl && (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={a.imageUrl}
                          alt=""
                          className="absolute inset-0 h-full w-full scale-110 object-cover blur-md"
                        />
                        <div className="absolute inset-0 bg-black/55" />
                      </>
                    )}
                    <div className="relative min-w-0">
                      <p
                        className={`font-semibold ${a.imageUrl ? "text-white" : ""}`}
                      >
                        {a.title}
                      </p>
                      {a.body && (
                        <p
                          className={`mt-1 whitespace-pre-line text-sm ${
                            a.imageUrl ? "text-white/85" : "text-fg-subtle"
                          }`}
                        >
                          {a.body}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-fg-subtle">{labels.noAnnouncements}</p>
            )
          ) : (
            activeEvent && (
              <EventCarousel
                key={activeEvent.slug}
                basePath={basePath}
                event={activeEvent}
                labels={labels}
              />
            )
          )}
        </div>
      </div>
    </section>
  );
}
