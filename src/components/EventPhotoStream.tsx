"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import PhotoCreditOverlay from "@/components/PhotoCreditOverlay";
import { homePhotoWeightScale } from "@/lib/homePhotoWeight";
import type {
  HomePhotoStreamPage,
  StreamEvent
} from "@/lib/homePhotoStreamTypes";
import { mergeStreamEvents } from "@/lib/homePhotoStreamMerge";

export type { StreamEvent, StreamPhoto } from "@/lib/homePhotoStreamTypes";

type StreamStatus = "idle" | "loading" | "error";

/**
 * The homepage's complete, progressively loaded photo archive. The first page
 * is server-rendered; an intersection sentinel then fetches bounded batches.
 * Album continuations are merged so a pagination boundary never creates a
 * duplicate heading or photograph.
 */
export default function EventPhotoStream({
  basePath,
  ownerUsername,
  locale,
  events: initialEvents,
  nextCursor: initialCursor,
  labels
}: {
  /** Root of the owner's site, e.g. "/u/alice" — locale is added by Link. */
  basePath: string;
  ownerUsername: string;
  locale: string;
  events: StreamEvent[];
  nextCursor: string | null;
  labels: {
    openPhoto: string;
    loadMore: string;
    loading: string;
    loadError: string;
    retry: string;
    end: string;
    loaded: string;
  };
}) {
  const [events, setEvents] = useState(initialEvents);
  const [cursor, setCursor] = useState(initialCursor);
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [announcement, setAnnouncement] = useState("");
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const requestRef = useRef<AbortController | null>(null);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingRef.current) return;

    loadingRef.current = true;
    setStatus("loading");
    setAnnouncement("");
    const controller = new AbortController();
    requestRef.current = controller;

    try {
      const query = new URLSearchParams({
        owner: ownerUsername,
        locale,
        cursor
      });
      const response = await fetch(`/api/public/home-stream?${query}`, {
        cache: "no-store",
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Photo stream request failed: ${response.status}`);

      const page = (await response.json()) as HomePhotoStreamPage;
      if (!Array.isArray(page.events)) throw new Error("Invalid photo stream response");

      const loadedCount = page.events.reduce(
        (count, event) => count + event.photos.length,
        0
      );
      setEvents((current) => mergeStreamEvents(current, page.events));
      setCursor(page.nextCursor);
      setAnnouncement(labels.loaded.replace("{count}", String(loadedCount)));
      setStatus("idle");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setStatus("error");
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      loadingRef.current = false;
    }
  }, [cursor, labels, locale, ownerUsername]);

  useEffect(() => () => requestRef.current?.abort(), []);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !cursor || status === "error") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { rootMargin: "600px 0px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [cursor, loadMore, status]);

  if (events.length === 0) return null;

  return (
    <div className="flex flex-col gap-10" aria-busy={status === "loading"}>
      {events.map((event) => (
        <section key={event.slug} className="flex flex-col gap-3">
          <Link
            href={`${basePath}/gallery/${event.slug}`}
            className="group flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
          >
            <h3 className="text-xl font-semibold group-hover:underline">
              {event.title}
            </h3>
            <span className="text-sm text-fg-subtle">
              {[event.date, event.location || null].filter(Boolean).join(" · ")}
            </span>
          </Link>
          {/*
            Justified contact sheet. Aspect ratio and the photographer's 1–5
            display weight determine each frame's share of the row.
          */}
          <ul className="flex flex-wrap gap-1 [--row-h:140px] sm:[--row-h:190px] lg:[--row-h:230px]">
            {event.photos.map((photo, index) => {
              const ar = photo.height ? photo.width / photo.height : 1;
              const weightScale = homePhotoWeightScale(photo.homeWeight);
              const fallbackLabel = `${event.title} — ${labels.openPhoto} ${index + 1}`;
              const linkLabel = photo.alt
                ? `${labels.openPhoto}: ${photo.alt}`
                : fallbackLabel;
              return (
                <li
                  key={photo.id}
                  data-home-weight={photo.homeWeight}
                  className="overflow-hidden rounded-md"
                  style={{
                    flexGrow: ar * weightScale,
                    flexBasis: `calc(${ar * weightScale} * var(--row-h))`
                  }}
                >
                  <Link
                    href={`${basePath}/gallery/${event.slug}?photo=${encodeURIComponent(photo.id)}`}
                    aria-label={linkLabel}
                    className="group relative block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url}
                      alt={photo.alt || fallbackLabel}
                      loading="lazy"
                      width={photo.width}
                      height={photo.height}
                      className="block h-full w-full object-cover transition-opacity duration-150 group-hover:opacity-90"
                    />
                    <PhotoCreditOverlay credit={photo.alt} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <div
        ref={sentinelRef}
        className="flex min-h-16 items-center justify-center border-t border-border pt-5"
      >
        {status === "loading" ? (
          <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-fg-subtle">
            <span className="font-meta text-[0.6875rem] font-semibold tracking-[0.16em] text-accent">
              LOADING / ARCHIVE
            </span>
            <span>{labels.loading}</span>
          </div>
        ) : status === "error" ? (
          <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
            <span className="text-fg-muted">{labels.loadError}</span>
            <button
              type="button"
              onClick={() => void loadMore()}
              className="inline-flex min-h-11 items-center rounded-lg border border-border-strong bg-raised px-4 py-2 font-semibold text-accent transition-[border-color,background-color,transform] hover:border-accent/35 hover:bg-accent-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 motion-safe:active:scale-[0.97]"
            >
              {labels.retry}
            </button>
          </div>
        ) : cursor ? (
          <button
            type="button"
            onClick={() => void loadMore()}
            className="inline-flex min-h-11 items-center rounded-lg border border-border-strong bg-raised px-4 py-2 text-sm font-semibold text-fg-muted transition-[border-color,color,transform] hover:border-accent/35 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 motion-safe:active:scale-[0.97]"
          >
            {labels.loadMore}
          </button>
        ) : (
          <div className="flex w-full flex-col items-center gap-2 text-center text-fg-subtle sm:flex-row sm:gap-3 sm:text-left">
            <span className="hidden h-px flex-1 bg-border sm:block" aria-hidden="true" />
            <span className="font-meta text-[0.6875rem] font-semibold tracking-[0.16em]">
              END / ARCHIVE
            </span>
            <span className="text-sm">{labels.end}</span>
            <span className="hidden h-px flex-1 bg-border sm:block" aria-hidden="true" />
          </div>
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
