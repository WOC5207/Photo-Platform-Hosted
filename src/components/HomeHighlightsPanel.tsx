"use client";

import {
  useId,
  useRef,
  useState,
  type CSSProperties,
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
  featuredPause: string;
  featuredResume: string;
}

const tabCls = (active: boolean) =>
  `min-h-11 shrink-0 truncate whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40 ${
    active ? "bg-fg text-page" : "text-fg-muted hover:bg-fg/5 hover:text-fg"
  }`;

const MIN_STREAM_ASPECT_WIDTH = 8;
const MAX_STREAM_ITEMS = 64;

function photoAspect(photo: HighlightPhoto): number {
  if (photo.width <= 0 || photo.height <= 0) return 1;
  return Math.max(0.5, photo.width / photo.height);
}

/**
 * Ensure one animation cycle is wider than the largest supported content
 * area. Short sets are repeated visually within the cycle; only the first
 * occurrence of each real photo remains interactive and exposed to assistive
 * technology.
 */
function buildStreamItems(photos: HighlightPhoto[]) {
  const items = photos.map((photo, index) => ({
    key: `${photo.id}-original`,
    photo,
    interactive: true,
    occurrence: index
  }));
  let aspectWidth = photos.reduce(
    (total, photo) => total + photoAspect(photo),
    0
  );
  let repeatIndex = 0;

  while (
    aspectWidth < MIN_STREAM_ASPECT_WIDTH &&
    items.length < MAX_STREAM_ITEMS
  ) {
    const photo = photos[repeatIndex % photos.length];
    items.push({
      key: `${photo.id}-filler-${repeatIndex}`,
      photo,
      interactive: false,
      occurrence: photos.length + repeatIndex
    });
    aspectWidth += photoAspect(photo);
    repeatIndex += 1;
  }

  return {
    items,
    durationSeconds: Math.min(72, Math.max(28, aspectWidth * 4))
  };
}

/** One event's uncropped photos in a seamless, pauseable horizontal stream. */
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
  const [paused, setPaused] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const { items, durationSeconds } = buildStreamItems(event.photos);
  const trackStyle = {
    "--featured-stream-duration": `${durationSeconds}s`
  } as CSSProperties;

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={viewportRef}
        data-testid="featured-photo-stream"
        data-paused={paused ? "true" : "false"}
        className="featured-photo-viewport rounded-xl bg-surface py-2"
      >
        <div
          data-testid="featured-photo-track"
          data-paused={paused ? "true" : "false"}
          className="featured-photo-track flex w-max"
          style={trackStyle}
        >
          {[0, 1].map((copyIndex) => (
            <ul
              key={copyIndex}
              aria-hidden={copyIndex === 1 ? "true" : undefined}
              className={`flex shrink-0 gap-3 pr-3 ${
                copyIndex === 1 ? "featured-photo-copy" : ""
              }`}
            >
              {items.map(({ key, photo, interactive, occurrence }) => {
                const isInteractive = copyIndex === 0 && interactive;
                const frameStyle = {
                  aspectRatio: `${Math.max(1, photo.width)} / ${Math.max(
                    1,
                    photo.height
                  )}`
                };
                const image = (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url}
                      alt={isInteractive ? photo.caption || event.title : ""}
                      width={photo.width}
                      height={photo.height}
                      loading={
                        copyIndex === 0 && occurrence < 2 ? "eager" : "lazy"
                      }
                      decoding="async"
                      data-testid={
                        isInteractive ? "featured-photo-image" : undefined
                      }
                      className="block h-full w-full object-contain"
                    />
                    {isInteractive && photo.caption && (
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent p-3 pt-10 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-visible:opacity-100">
                        <p className="truncate text-xs font-medium text-white">
                          {photo.caption}
                        </p>
                      </div>
                    )}
                  </>
                );

                return (
                  <li
                    key={`${copyIndex}-${key}`}
                    aria-hidden={isInteractive ? undefined : "true"}
                    className="relative h-52 min-w-36 shrink-0 overflow-hidden rounded-lg bg-page sm:h-72 lg:h-80"
                    style={frameStyle}
                  >
                    {isInteractive ? (
                      <Link
                        href={`${basePath}/gallery/${event.slug}?photo=${encodeURIComponent(
                          photo.id
                        )}`}
                        aria-label={photo.caption || event.title}
                        data-testid="featured-photo"
                        data-original-photo-id={photo.id}
                        className="group relative block h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-fg/60"
                      >
                        {image}
                      </Link>
                    ) : (
                      <div className="relative h-full w-full">{image}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-fg-subtle">{event.dateLabel}</span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={paused}
            onClick={() => {
              if (paused) viewportRef.current?.scrollTo({ left: 0 });
              setPaused((current) => !current);
            }}
            className="featured-photo-motion-control inline-flex min-h-11 items-center rounded-full border border-border-strong px-4 py-2 text-xs font-semibold text-fg-muted transition hover:border-fg-faint hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40 sm:min-h-8"
          >
            {paused ? labels.featuredResume : labels.featuredPause}
          </button>
          <Link
            href={`${basePath}/gallery/${event.slug}`}
            className="inline-flex min-h-11 items-center rounded-full border border-border-strong px-4 py-2 text-xs font-semibold text-fg-muted transition hover:border-fg-faint hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40 sm:min-h-8"
          >
            {labels.viewGallery}
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * Homepage panel: a tab switcher for announcements and highlighted events,
 * with the active event rendered as a continuous featured-photo stream.
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
