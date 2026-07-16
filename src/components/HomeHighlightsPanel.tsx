"use client";

import { useState } from "react";
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
  `shrink-0 truncate whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
    active ? "bg-fg text-page" : "text-fg-muted hover:bg-fg/5 hover:text-fg"
  }`;

/** One event's photos, paged through with prev/next arrows and dot indicators. */
function EventCarousel({
  event,
  labels
}: {
  event: HighlightEventGroup;
  labels: HomeHighlightsLabels;
}) {
  const [index, setIndex] = useState(0);
  const photo = event.photos[index];
  const hasMultiple = event.photos.length > 1;

  return (
    <div className="flex flex-col gap-3">
      <div className="group relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-surface sm:aspect-video">
        <Link href={`/gallery/${event.slug}`} className="block h-full w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.url}
            alt={event.title}
            className="h-full w-full object-cover"
          />
          {photo.caption && (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent p-4 pt-10 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
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
              className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-page/80 text-lg text-fg shadow-lg backdrop-blur transition hover:bg-page"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => setIndex((i) => (i + 1) % event.photos.length)}
              aria-label={labels.carouselNext}
              className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-page/80 text-lg text-fg shadow-lg backdrop-blur transition hover:bg-page"
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
              className={`h-2 w-2 rounded-full transition ${
                i === index ? "bg-fg" : "bg-fg/20 hover:bg-fg/40"
              }`}
            />
          ))}
        </div>
        <Link
          href={`/gallery/${event.slug}`}
          className="rounded-full border border-border-strong px-4 py-1.5 text-xs font-semibold text-fg-muted transition hover:border-fg-faint hover:text-fg"
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
  events,
  announcements,
  announcementsEnabled,
  labels
}: {
  events: HighlightEventGroup[];
  announcements: HighlightAnnouncement[];
  announcementsEnabled: boolean;
  labels: HomeHighlightsLabels;
}) {
  const [activeTab, setActiveTab] = useState<string>(
    announcementsEnabled ? "announcements" : (events[0]?.slug ?? "")
  );
  const activeEvent = events.find((e) => e.slug === activeTab);
  const showAnnouncements = announcementsEnabled && activeTab === "announcements";

  return (
    <section className="overflow-hidden rounded-2xl border border-fg/10 bg-page/85">
      <div className="flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:gap-8">
        <div className="flex shrink-0 gap-2 overflow-x-auto lg:w-48 lg:flex-col lg:overflow-visible">
          {announcementsEnabled && (
            <button
              type="button"
              onClick={() => setActiveTab("announcements")}
              className={tabCls(activeTab === "announcements")}
            >
              {labels.announcementsTab}
            </button>
          )}
          {events.map((event) => (
            <button
              key={event.slug}
              type="button"
              onClick={() => setActiveTab(event.slug)}
              className={tabCls(activeTab === event.slug)}
            >
              {event.title}
            </button>
          ))}
        </div>

        <div className="min-w-0 flex-1">
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
