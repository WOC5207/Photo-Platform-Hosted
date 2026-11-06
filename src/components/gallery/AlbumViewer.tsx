"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import PhotoCreditOverlay from "@/components/PhotoCreditOverlay";
import { usePresence } from "@/hooks/usePresence";
import type { PhotoExifDisplay } from "@/lib/exif";
import { lessMotion } from "@/lib/motion";

// The site's motion tokens (--ease-out / --ease-in in globals.css), for the
// animations run from script.
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
const EASE_IN = "cubic-bezier(0.4, 0, 1, 1)";
// How long a step keeps the current photo up while the next one decodes,
// before it gives up waiting and shows the next one as it loads.
const DECODE_WAIT_MS = 300;
// A swipe this long, or this fast (px per ms), turns the photo.
const SWIPE_PX = 60;
const FLICK_SPEED = 0.5;

export interface AlbumPhoto {
  id: string;
  thumb: string;
  med: string;
  full: string;
  caption: string;
  comment: string;
  socialLinks: { name: string; label: string; url: string }[];
  width: number;
  height: number;
  exif: PhotoExifDisplay;
}

export interface LightboxLabels {
  open: string;
  close: string;
  previous: string;
  next: string;
}

export default function AlbumViewer({
  photos,
  initialPhotoId,
  labels,
  positionOffset = 0,
  totalPhotos = photos.length
}: {
  photos: AlbumPhoto[];
  initialPhotoId?: string;
  labels: LightboxLabels;
  positionOffset?: number;
  totalPhotos?: number;
}) {
  const [mounted, setMounted] = useState(false);
  const [openIndex, setOpenIndex] = useState<number | null>(() => {
    if (!initialPhotoId) return null;
    const index = photos.findIndex((photo) => photo.id === initialPhotoId);
    return index >= 0 ? index : null;
  });

  // Client components are also rendered on the server. A search result may
  // deep-link straight into the lightbox with ?photo=..., but createPortal
  // cannot target document.body until hydration has completed.
  useEffect(() => setMounted(true), []);

  // The viewer fades out as dialogs do (usePresence), still on the photo it
  // was showing.
  const { present, leaving } = usePresence(openIndex !== null);
  const [lastIndex, setLastIndex] = useState(openIndex);
  if (openIndex !== null && openIndex !== lastIndex) setLastIndex(openIndex);
  const close = useCallback(() => setOpenIndex(null), []);

  return (
    <>
      {/*
        Justified "poster" mosaic: each item's flex-basis and flex-grow are
        proportional to the photo's aspect ratio, so rows fill the full width
        edge-to-edge and all photos in a row share one height (varying row to
        row → varied, packed sizes). The item box ends up at the photo's own
        aspect ratio, so object-cover has essentially nothing to crop.
      */}
      <ul className="flex flex-wrap gap-1 [--row-h:150px] sm:[--row-h:210px] lg:[--row-h:250px]">
        {photos.map((photo, i) => {
          const ar = photo.height ? photo.width / photo.height : 1;
          return (
            <li
              key={photo.id}
              className="overflow-hidden rounded-md"
              style={{ flexGrow: ar, flexBasis: `calc(${ar} * var(--row-h))` }}
            >
              <button
                type="button"
                onClick={() => setOpenIndex(i)}
                aria-label={
                  photo.caption ||
                  `${labels.open} ${positionOffset + i + 1} / ${totalPhotos}`
                }
                className="group relative block h-full w-full cursor-zoom-in rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-offset-2 focus-visible:ring-offset-page"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.thumb}
                  srcSet={`${photo.thumb} 480w, ${photo.med} 1280w`}
                  sizes="(max-width: 640px) 50vw, 33vw"
                  alt={photo.caption}
                  loading="lazy"
                  className="block h-full w-full object-cover transition group-hover:opacity-90"
                />
                <PhotoCreditOverlay credit={photo.caption} />
              </button>
            </li>
          );
        })}
      </ul>

      {mounted && present && lastIndex !== null && (
        <Lightbox
          photos={photos}
          index={lastIndex}
          labels={labels}
          positionOffset={positionOffset}
          totalPhotos={totalPhotos}
          leaving={leaving}
          onNavigate={setOpenIndex}
          onClose={close}
        />
      )}
    </>
  );
}

/**
 * Loads and decodes a photo at the size the viewer will show it, once, so a
 * step can swap to it whole instead of showing an empty frame while it
 * downloads. The browser keeps what was fetched, so the viewer's own <img>
 * then finds it ready.
 */
const preloaded = new Map<string, Promise<void>>();
function preload(photo: AlbumPhoto): Promise<void> {
  let ready = preloaded.get(photo.id);
  if (!ready) {
    new Image().src = photo.thumb; // the ambient backdrop
    const image = new Image();
    image.sizes = "100vw";
    image.srcset = `${photo.med} 1280w, ${photo.full} 2560w`;
    image.src = photo.med;
    ready = image.decode().catch(() => undefined);
    preloaded.set(photo.id, ready);
  }
  return ready;
}

/** Whether the visitor has pinch-zoomed the page, so a drag should pan it. */
function zoomed(): boolean {
  return (window.visualViewport?.scale ?? 1) > 1.01;
}

function Lightbox({
  photos,
  index,
  labels,
  positionOffset,
  totalPhotos,
  leaving,
  onNavigate,
  onClose
}: {
  photos: AlbumPhoto[];
  index: number;
  labels: LightboxLabels;
  positionOffset: number;
  totalPhotos: number;
  leaving: boolean;
  onNavigate: (i: number) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  // Which way the last step went (1 forward, -1 back), for the new photo's
  // entrance, and the slide still holding the old photo off to the side.
  const direction = useRef(1);
  const slide = useRef<Animation | null>(null);
  const drag = useRef<{
    x: number;
    y: number;
    at: number;
    offset: number;
    horizontal: boolean | null;
  } | null>(null);
  // When the last swipe ended: the tap the browser may still report for it
  // must not close the viewer.
  const swipedAt = useRef(-Infinity);

  // The photo on screen trails the one asked for until that one has
  // decoded (or DECODE_WAIT_MS has passed), so a step swaps one finished
  // photo for another; the counter follows the step at once.
  const [shownIndex, setShownIndex] = useState(index);
  const shown = Math.min(shownIndex, photos.length - 1);
  const photo = photos[shown];

  const hasPrevious = index > 0;
  const hasNext = index < photos.length - 1;
  const prev = useCallback(() => {
    if (!hasPrevious) return;
    direction.current = -1;
    onNavigate(index - 1);
  }, [hasPrevious, index, onNavigate]);
  const next = useCallback(() => {
    if (!hasNext) return;
    direction.current = 1;
    onNavigate(index + 1);
  }, [hasNext, index, onNavigate]);

  // The keyboard handler, scroll lock and focus are set up once per opening
  // and read the current step through this ref: re-running them on every
  // step unlocked and relocked the page and moved focus behind the viewer
  // and back each time.
  const latest = useRef({ prev, next, onClose });
  latest.current = { prev, next, onClose };

  useEffect(() => {
    if (leaving) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") latest.current.onClose();
      else if (e.key === "ArrowLeft") latest.current.prev();
      else if (e.key === "ArrowRight") latest.current.next();
      else if (e.key === "Tab" && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        );
        if (focusable.length === 0) {
          e.preventDefault();
          dialogRef.current.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    // Lock body scroll while open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previousFocus?.focus();
    };
  }, [leaving]);

  useEffect(() => {
    if (index === shown) {
      // Stepped back to the photo on screen before the slide had turned it.
      if (slide.current) {
        slide.current.cancel();
        slide.current = null;
      }
      return;
    }
    let current = true;
    const swap = () => {
      if (current) setShownIndex(index);
    };
    const timer = window.setTimeout(swap, DECODE_WAIT_MS);
    void preload(photos[index]).then(swap);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [index, shown, photos]);

  // The neighbours load while this photo is looked at.
  useEffect(() => {
    if (index > 0) void preload(photos[index - 1]);
    if (index < photos.length - 1) void preload(photos[index + 1]);
  }, [index, photos]);

  // A new photo comes in from the side the step went to.
  const firstShown = useRef(true);
  useLayoutEffect(() => {
    if (firstShown.current) {
      firstShown.current = false;
      return;
    }
    const image = imageRef.current;
    slide.current?.cancel();
    slide.current = null;
    if (!image) return;
    image.style.transform = "";
    if (lessMotion()) return;
    image.animate(
      [
        { opacity: 0, transform: `translateX(${direction.current * 32}px)` },
        { opacity: 1, transform: "none" }
      ],
      { duration: 300, easing: EASE_OUT }
    );
  }, [shown]);

  // A swipe moves the photo with the finger; let go far or fast enough and
  // it slides off for the next one, otherwise it springs back.
  const settle = (offset: number, turn: number) => {
    const image = imageRef.current;
    if (!image) return;
    image.style.transform = "";
    const step = () => (turn > 0 ? latest.current.next() : latest.current.prev());
    if (lessMotion()) {
      if (turn) step();
      return;
    }
    const width = image.parentElement?.clientWidth ?? window.innerWidth;
    const animation = image.animate(
      [
        { opacity: 1, transform: `translateX(${offset}px)` },
        turn
          ? { opacity: 0, transform: `translateX(${-turn * width * 0.6}px)` }
          : { opacity: 1, transform: "none" }
      ],
      turn
        ? { duration: 200, easing: EASE_IN, fill: "forwards" }
        : { duration: 300, easing: EASE_OUT }
    );
    if (!turn) return;
    slide.current = animation;
    direction.current = turn;
    animation.onfinish = step;
  };

  const shootLine = [photo.exif.focalLength, photo.exif.exposure, photo.exif.date]
    .filter(Boolean)
    .join(" · ");
  const gearLine = photo.exif.gear;

  // Rendered via a portal straight into <body>: the page's <main> panel has
  // a backdrop-blur (for its "liquid glass" look), and any ancestor with
  // backdrop-filter/filter/transform creates a new containing block for
  // fixed-position descendants — which would size/position this modal
  // relative to that panel instead of the actual viewport.
  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${positionOffset + index + 1} / ${totalPhotos}`}
      tabIndex={-1}
      data-leaving={leaving || undefined}
      inert={leaving}
      className="dialog-overlay fixed inset-0 z-50 flex flex-col overflow-hidden bg-black"
      onClick={(e) => {
        if (e.timeStamp - swipedAt.current > 500) onClose();
      }}
      onTouchStart={(e) => {
        if (e.touches.length !== 1 || slide.current || zoomed()) {
          drag.current = null;
          return;
        }
        const touch = e.touches[0];
        drag.current = {
          x: touch.clientX,
          y: touch.clientY,
          at: e.timeStamp,
          offset: 0,
          horizontal: null
        };
      }}
      onTouchMove={(e) => {
        const swipe = drag.current;
        const image = imageRef.current;
        if (!swipe || !image) return;
        if (e.touches.length !== 1) {
          drag.current = null;
          settle(swipe.offset, 0);
          return;
        }
        const dx = e.touches[0].clientX - swipe.x;
        const dy = e.touches[0].clientY - swipe.y;
        if (swipe.horizontal === null) {
          if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
          swipe.horizontal = Math.abs(dx) > Math.abs(dy);
        }
        if (!swipe.horizontal) return;
        // Past the first or last photo it drags with resistance.
        const blocked = dx > 0 ? !hasPrevious : !hasNext;
        swipe.offset = blocked ? dx * 0.3 : dx;
        image.style.transform = `translateX(${swipe.offset}px)`;
      }}
      onTouchEnd={(e) => {
        const swipe = drag.current;
        drag.current = null;
        if (!swipe?.horizontal) return;
        swipedAt.current = e.timeStamp;
        const dx = e.changedTouches[0].clientX - swipe.x;
        const speed = Math.abs(dx) / Math.max(1, e.timeStamp - swipe.at);
        const far = Math.abs(dx) > SWIPE_PX || (speed > FLICK_SPEED && Math.abs(dx) > 20);
        const turn = dx > 0 ? -1 : 1;
        settle(swipe.offset, far && (turn > 0 ? hasNext : hasPrevious) ? turn : 0);
      }}
      onTouchCancel={() => {
        const swipe = drag.current;
        drag.current = null;
        if (swipe?.horizontal) settle(swipe.offset, 0);
      }}
    >
      {/* Ambient backdrop: the same photo, heavily blurred and darkened, in
          place of a flat black background/border around the enlarged photo.
          The small thumbnail is blurred with a plain filter, drawn once per
          photo, rather than a backdrop-filter over the full-size image; it
          overhangs the screen so the blur has no soft edge. */}
      <div
        aria-hidden
        className="absolute -inset-24"
        style={{
          backgroundImage: `url(${photo.thumb})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "blur(40px)"
        }}
      />
      <div aria-hidden className="absolute inset-0 bg-black/55" />

      <div className="relative z-10 flex items-center justify-between bg-black/30 p-4 backdrop-blur-sm">
        <span className="text-sm tabular-nums text-neutral-300">
          {positionOffset + index + 1} / {totalPhotos}
        </span>
        <button
          ref={closeRef}
          type="button"
          aria-label={labels.close}
          onClick={onClose}
          className="min-h-11 rounded-full bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          ✕
        </button>
      </div>

      <div className="dialog-panel relative z-10 flex flex-1 items-center justify-center overflow-hidden px-2 pb-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imageRef}
          src={photo.med}
          srcSet={`${photo.med} 1280w, ${photo.full} 2560w`}
          sizes="100vw"
          alt={photo.caption}
          onClick={(e) => e.stopPropagation()}
          className="max-h-full max-w-full rounded-md object-contain shadow-2xl will-change-transform"
        />

        <button
          type="button"
          aria-label={labels.previous}
          disabled={!hasPrevious}
          onClick={(e) => {
            e.stopPropagation();
            prev();
          }}
          className="absolute left-2 top-1/2 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 px-3 py-3 text-white hover:bg-black/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-25"
        >
          ‹
        </button>
        <button
          type="button"
          aria-label={labels.next}
          disabled={!hasNext}
          onClick={(e) => {
            e.stopPropagation();
            next();
          }}
          className="absolute right-2 top-1/2 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 px-3 py-3 text-white hover:bg-black/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-25"
        >
          ›
        </button>
      </div>

      {/* Information bar: credit line, comment, social buttons, camera/lens, shooting data. */}
      {(photo.caption ||
        photo.comment ||
        gearLine ||
        shootLine ||
        photo.socialLinks.length > 0) && (
        <div
          className="relative z-10 flex flex-col items-center gap-2 bg-black/30 px-4 pb-6 pt-3 backdrop-blur-sm"
          onClick={(e) => e.stopPropagation()}
        >
          {photo.caption && (
            <p className="text-center text-sm font-medium text-neutral-100">
              {photo.caption}
            </p>
          )}
          {photo.comment && (
            <p className="max-w-2xl whitespace-pre-line text-center text-sm text-neutral-300">
              {photo.comment}
            </p>
          )}
          {photo.socialLinks.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              {photo.socialLinks.map((link, i) => (
                <a
                  key={i}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={link.name ? `${link.name} · ${link.label}` : undefined}
                  className="inline-flex max-w-full items-center rounded-full bg-white/10 px-3 py-1.5 text-xs text-white transition hover:bg-white/20"
                >
                  {link.name && (
                    <>
                      <span className="min-w-0 truncate font-medium">{link.name}</span>
                      <span aria-hidden="true" className="mx-1.5 text-white/50">·</span>
                    </>
                  )}
                  <span className="shrink-0">{link.label} ↗</span>
                </a>
              ))}
            </div>
          )}
          {gearLine && (
            <p className="text-center text-xs text-neutral-400">{gearLine}</p>
          )}
          {shootLine && (
            <p className="text-center text-xs text-neutral-400">{shootLine}</p>
          )}
        </div>
      )}
    </div>,
    document.body
  );
}
