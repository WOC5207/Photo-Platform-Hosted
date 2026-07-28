"use client";

import {
  useId,
  useRef,
  useState,
  type KeyboardEvent
} from "react";
import { Link } from "@/i18n/navigation";

export interface HighlightPhoto {
  id: string;
  url: string;
  caption: string;
  width: number;
  height: number;
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
}

const tabCls = (active: boolean) =>
  `min-h-11 shrink-0 truncate whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40 ${
    active ? "bg-fg text-page" : "text-fg-muted hover:bg-fg/5 hover:text-fg"
  }`;

/** One event's original, uncropped photos in a static horizontal row. */
function FeaturedPhotoStream({
  basePath,
  event,
  labels
}: {
  /** Root of the owner's site, e.g. "/u/alice"; locale is added by Link. */
  basePath: string;
  event: HighlightEventGroup;
  labels: HomeHighlightsLabels;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div
        data-testid="featured-photo-stream"
        className="snap-x snap-proximity overflow-x-auto rounded-xl bg-surface py-2 [scrollbar-width:thin]"
      >
        <ul className="flex w-max gap-3 pr-3">
          {event.photos.map((photo, index) => (
            <li
              key={photo.id}
              className="relative h-52 min-w-36 shrink-0 snap-start overflow-hidden rounded-lg bg-page sm:h-72 lg:h-80"
              style={{
                aspectRatio: `${Math.max(1, photo.width)} / ${Math.max(
                  1,
                  photo.height
                )}`
              }}
            >
              <Link
                href={`${basePath}/gallery/${event.slug}?photo=${encodeURIComponent(
                  photo.id
                )}`}
                aria-label={photo.caption || event.title}
                data-testid="featured-photo"
                data-original-photo-id={photo.id}
                className="group relative block h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-fg/60"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt={photo.caption || event.title}
                  width={photo.width}
                  height={photo.height}
                  loading={index < 2 ? "eager" : "lazy"}
                  decoding="async"
                  data-testid="featured-photo-image"
                  className="block h-full w-full object-contain"
                />
                {photo.caption && (
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent p-3 pt-10 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-visible:opacity-100">
                    <p className="truncate text-xs font-medium text-white">
                      {photo.caption}
                    </p>
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-fg-subtle">{event.dateLabel}</span>
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
 * Homepage panel: a tab switcher for announcements and highlighted events,
 * with the active event rendered as an uncropped featured-photo row.
 */
export default function HomeHighlightsPanel({
  basePath,
  events,
  announcements,
  announcementsEnabled,
  labels
}: {
  /** Root of the owner's site, e.g. "/u/alice"; locale is added by Link. */
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
  const activeEvent = events.find((event) => event.slug === activeTab);
  const showAnnouncements =
    announcementsEnabled && activeTab === "announcements";
  const tabIds = [
    ...(announcementsEnabled ? ["announcements"] : []),
    ...events.map((event) => event.slug)
  ];

  if (tabIds.length === 0) return null;

  function onTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    id: string
  ) {
    if (
      ![
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End"
      ].includes(event.key)
    ) {
      return;
    }
    event.preventDefault();
    const current = tabIds.indexOf(id);
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabIds.length - 1
          : event.key === "ArrowLeft" || event.key === "ArrowUp"
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
              onKeyDown={(event) => onTabKeyDown(event, "announcements")}
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
              onKeyDown={(keyboardEvent) =>
                onTabKeyDown(keyboardEvent, event.slug)
              }
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
                {announcements.map((announcement) => (
                  <li
                    key={announcement.id}
                    className={`relative overflow-hidden rounded-xl border border-fg/10 bg-surface p-4 ${
                      announcement.imageUrl ? "min-h-[7rem]" : ""
                    }`}
                  >
                    {announcement.imageUrl && (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={announcement.imageUrl}
                          alt=""
                          className="absolute inset-0 h-full w-full scale-110 object-cover blur-md"
                        />
                        <div className="absolute inset-0 bg-black/55" />
                      </>
                    )}
                    <div className="relative min-w-0">
                      <p
                        className={`font-semibold ${
                          announcement.imageUrl ? "text-white" : ""
                        }`}
                      >
                        {announcement.title}
                      </p>
                      {announcement.body && (
                        <p
                          className={`mt-1 whitespace-pre-line text-sm ${
                            announcement.imageUrl
                              ? "text-white/85"
                              : "text-fg-subtle"
                          }`}
                        >
                          {announcement.body}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-fg-subtle">
                {labels.noAnnouncements}
              </p>
            )
          ) : (
            activeEvent && (
              <FeaturedPhotoStream
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
