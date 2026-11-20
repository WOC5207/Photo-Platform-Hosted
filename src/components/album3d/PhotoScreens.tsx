"use client";

import { useEffect, useRef, useState, useTransition, type TouchEvent } from "react";
import { setCoverPhoto } from "@/app/[locale]/dashboard/(protected)/events/actions";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { screenPath } from "@/lib/siteMode";
import { Rolling, pad } from "./hud";
import styles from "./ArchiveSite.module.css";
import { photoRect, type AlbumPhotos, type ArchiveFile } from "./types";

const metaLabel = "font-meta text-[0.625rem] uppercase tracking-[0.16em] text-fg-subtle";
const square = "grid h-11 w-11 shrink-0 place-items-center text-2xl transition hover:bg-accent-surface disabled:opacity-30";

/**
 * The light table: the album's prints are in the scene; this panel names the
 * album, counts the focused print and lists every photo as a link for
 * keyboard and screen reader visitors.
 */
export function TableScreen({
  file,
  owner,
  username,
  album,
  focus,
  onFocus,
  onOpen,
  onBack,
  classicHref
}: {
  file: ArchiveFile;
  owner: string;
  username: string;
  album: AlbumPhotos | null;
  focus: number;
  onFocus: (index: number) => void;
  onOpen: (index: number) => void;
  onBack: () => void;
  classicHref: string;
}) {
  const t = useTranslations("album3d");
  const total = album?.photos.length ?? 0;
  const [wholeTitle, setWholeTitle] = useState(false);
  const [gridCols, setGridCols] = useState<1 | 2>(2);

  return (
    <main id="main-content" tabIndex={-1} className={`${styles.menuPanel} outline-none`}>
      <p className={metaLabel}>
        {owner}
      </p>
      {/* Phones cut a long title to two lines; a tap shows the rest. */}
      <h1
        title={file.title}
        onClick={() => setWholeTitle((open) => !open)}
        className={`mt-3 text-[2.25rem] font-extrabold uppercase leading-[0.95] tracking-[-0.04em] [overflow-wrap:anywhere] max-sm:text-[1.75rem] wide:text-[3.75rem] ${wholeTitle ? "" : "max-sm:line-clamp-2"}`}
      >
        {file.title}
      </h1>
      <div aria-hidden="true" className={styles.calloutRule} />
      {!album ? (
        <p role="status" className={`${metaLabel} mt-8`}>{t("loadingPhotos")}</p>
      ) : total === 0 ? (
        <p className="mt-8 text-sm text-fg-muted">{t("noPhotos")}</p>
      ) : (
        <>
          {/* Phones show an uncropped 2-col / 1-col editorial gallery; the 3D table stays a dimmed backdrop. */}
          <div aria-label={t("lightTable")} className={`${styles.phoneGrid} mt-5`}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className={metaLabel}>{t("photos", { count: total })}</p>
              <div className="inline-flex border border-border-strong">
                {([2, 1] as const).map((cols) => (
                  <button
                    key={cols}
                    type="button"
                    aria-pressed={gridCols === cols}
                    onClick={() => setGridCols(cols)}
                    className={`font-meta min-h-9 px-3 text-[0.625rem] font-semibold uppercase tracking-[0.1em] transition ${
                      gridCols === cols ? "bg-fg text-page" : "text-fg-muted hover:text-fg"
                    }`}
                  >
                    {t(cols === 2 ? "gridTwoCol" : "gridOneCol")}
                  </button>
                ))}
              </div>
            </div>
            {gridCols === 2 ? (
              <div className="grid grid-cols-2 items-start gap-2.5">
                {[0, 1].map((col) => (
                  <div key={col} className="grid gap-2.5">
                    {album.photos.map((photo, i) =>
                      i % 2 === col ? (
                        <button
                          key={photo.id}
                          type="button"
                          onClick={() => onOpen(i)}
                          className="block w-full overflow-hidden bg-control text-left"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={photo.thumb}
                            width={photo.width}
                            height={photo.height}
                            alt={photo.caption || t("printCount", { current: i + 1, total })}
                            loading="lazy"
                            decoding="async"
                            className="block h-auto w-full"
                          />
                        </button>
                      ) : null
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <ol className="grid gap-4">
                {album.photos.map((photo, i) => (
                  <li key={photo.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(i)}
                      className="block w-full overflow-hidden bg-control text-left"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.med}
                        width={photo.width}
                        height={photo.height}
                        alt={photo.caption || t("printCount", { current: i + 1, total })}
                        loading="lazy"
                        decoding="async"
                        className="block h-auto w-full"
                      />
                    </button>
                    {photo.caption && (
                      <p className="mt-1.5 text-xs text-fg-muted">{photo.caption}</p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div className={`${styles.phoneHide} mt-6`}>
            <p className={metaLabel}>{t("lightTable")}</p>
            <div className="mt-1 flex items-center gap-4">
              <p className="flex items-baseline gap-3">
                <span className="text-[2.125rem] leading-none wide:text-[3rem]">
                  <Rolling value={pad(focus + 1)} />
                </span>
                <span aria-hidden="true" className="text-xl font-light text-fg-subtle">/</span>
                <span className="text-sm text-fg-muted wide:text-[1.375rem]">{pad(total)}</span>
                <span className="sr-only">{t("printCount", { current: focus + 1, total })}</span>
              </p>
              {total > 1 && (
                <span className="flex">
                  <button type="button" onClick={() => onFocus(focus - 1)} disabled={focus <= 0} aria-label={t("prevPhoto")} className={square}>←</button>
                  <button type="button" onClick={() => onFocus(focus + 1)} disabled={focus >= total - 1} aria-label={t("nextPhoto")} className={square}>→</button>
                </span>
              )}
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-x-10 gap-y-2">
            <button
              type="button"
              onClick={() => onOpen(focus)}
              className={`${styles.phoneHide} group inline-flex min-h-11 items-center gap-12 text-sm font-medium uppercase tracking-[0.07em]`}
            >
              {t("openPhoto")}
              <span aria-hidden="true" className="text-2xl transition-transform group-hover:translate-x-2 motion-reduce:transition-none">→</span>
            </button>
            <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-2 text-sm text-fg-muted hover:text-fg">
              <span aria-hidden="true">←</span> {t("back")}
            </button>
          </div>
          {album.more > 0 && (
            <p className="mt-4 text-xs text-fg-muted">
              <Link href={classicHref} className="inline-flex min-h-11 items-center underline-offset-4 hover:text-fg hover:underline">
                {t("morePhotos", { count: album.more })} ↗
              </Link>
            </p>
          )}
          <ol aria-label={t("lightTable")} className={`${styles.phoneHide} sr-only`}>
            {album.photos.map((photo, i) => (
              <li key={photo.id}>
                <Link href={screenPath({ kind: "photo", username, slug: file.slug, photoId: photo.id })} scroll={false}>
                  {t("printCount", { current: i + 1, total })}
                  {photo.caption ? `, ${photo.caption}` : ""}
                </Link>
              </li>
            ))}
          </ol>
        </>
      )}
    </main>
  );
}

/**
 * One photo, raised off the light table. The scene lifts the print into the
 * box photoRect describes, and once it is there the full-resolution image
 * fades in over it.
 */
export function PhotoScreen({
  file,
  owner,
  album,
  index,
  owned,
  onStep,
  onBack,
  printUp
}: {
  file: ArchiveFile;
  owner: string;
  album: AlbumPhotos;
  index: number;
  /** The signed-in photographer owns the album, so may make this photo its cover. */
  owned: boolean;
  onStep: (direction: 1 | -1) => void;
  onBack: () => void;
  /** The scene's print has reached this image's box. */
  printUp: boolean;
}) {
  const t = useTranslations("album3d");
  const tc = useTranslations("common");
  const photo = album.photos[index];
  const total = album.photos.length;
  const [viewport, setViewport] = useState<{ width: number; height: number } | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  // The photo last shown in full stays under the next one until that has loaded and faded in.
  const [under, setUnder] = useState<AlbumPhotos["photos"][number] | null>(null);
  const [cover, setCover] = useState(album.coverId);
  const [saving, startSaving] = useTransition();
  const [infoOpen, setInfoOpen] = useState(false);
  const [chromeHidden, setChromeHidden] = useState(false);
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => setCover(album.coverId), [album.coverId]);
  const makeCover = () =>
    startSaving(async () => {
      const form = new FormData();
      form.set("photoId", photo.id);
      await setCoverPhoto(form);
      setCover(photo.id);
    });

  useEffect(() => {
    const measure = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const portrait = Boolean(viewport && viewport.width / Math.max(1, viewport.height) < 1.05);
  const readyToShow = portrait || printUp;

  useEffect(() => {
    if (!infoOpen && !chromeHidden) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (infoOpen) setInfoOpen(false);
        else setChromeHidden(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [infoOpen, chromeHidden]);

  useEffect(() => {
    if (loaded !== photo.id || !readyToShow) return;
    const timer = window.setTimeout(() => setUnder(photo), 320);
    return () => window.clearTimeout(timer);
  }, [loaded, photo, readyToShow]);

  const rect = viewport ? photoRect(viewport.width, viewport.height) : null;
  const shootLine = [photo.exif.focalLength, photo.exif.exposure, photo.exif.date].filter(Boolean).join(" · ");

  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    swipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: TouchEvent) => {
    const start = swipeRef.current;
    swipeRef.current = null;
    if (!start || e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      if (dx < 0 && index < total - 1) onStep(1);
      else if (dx > 0 && index > 0) onStep(-1);
    }
  };

  const infoContent = (
    <>
      <h1 id="album3d-photo-title" className="mt-2 text-[1.5rem] font-bold leading-tight tracking-[-0.02em] [overflow-wrap:anywhere] wide:text-[2rem]">
        {photo.caption || file.title}
      </h1>
      <p className="font-meta mt-2 text-[0.625rem] uppercase tracking-[0.12em] text-fg-subtle">
        {photo.caption ? `${file.title} / ${owner}` : owner}
      </p>
      <div aria-hidden="true" className="mt-5 h-0.5 bg-fg" />
      {photo.comment && <p className="mt-5 whitespace-pre-line text-sm text-fg-muted">{photo.comment}</p>}
      {(photo.exif.gear || shootLine) && (
        <dl className="mt-5 grid gap-4">
          {photo.exif.gear && (
            <div>
              <dt className={metaLabel}>{t("metaGear")}</dt>
              <dd className="mt-1 text-sm">{photo.exif.gear}</dd>
            </div>
          )}
          {shootLine && (
            <div>
              <dt className={metaLabel}>{t("metaShot")}</dt>
              <dd className="mt-1 text-sm">{shootLine}</dd>
            </div>
          )}
        </dl>
      )}
      {photo.socialLinks.length > 0 && (
        <ul className="mt-5 flex flex-wrap gap-2">
          {photo.socialLinks.map((link, i) => (
            <li key={i} className="max-w-full">
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                title={link.name ? `${link.name} · ${link.label}` : undefined}
                className="inline-flex min-h-9 max-w-full items-center border border-border-strong px-3 text-xs uppercase tracking-[0.08em] hover:border-fg"
              >
                {link.name && (
                  <>
                    <span className="min-w-0 truncate font-semibold normal-case tracking-normal">{link.name}</span>
                    <span aria-hidden="true" className="mx-1.5 text-fg-subtle">·</span>
                  </>
                )}
                <span className="shrink-0">{link.label}</span>
                <span aria-hidden="true" className="ml-2">↗</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {owned && (
        <button
          type="button"
          onClick={makeCover}
          disabled={saving || cover === photo.id}
          aria-busy={saving}
          className="mt-6 inline-flex min-h-11 items-center gap-3 border border-border-strong px-4 text-xs font-semibold uppercase tracking-[0.08em] transition hover:border-fg disabled:opacity-60"
        >
          <span aria-hidden="true">{cover === photo.id ? "★" : "☆"}</span>
          {cover === photo.id ? t("photoIsCover") : t("photoMakeCover")}
        </button>
      )}
      <div className="mt-7 flex flex-wrap items-center gap-x-8 gap-y-2">
        <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-3 text-sm hover:text-accent-text">
          <span aria-hidden="true" className="text-xl">←</span> {t("back")}
          <kbd className="font-meta hidden border border-border-strong p-1 text-[0.625rem] text-fg-subtle wide:inline">ESC</kbd>
        </button>
      </div>
    </>
  );

  if (portrait) {
    return (
      <main id="main-content" tabIndex={-1} className="outline-none">
        <div aria-hidden="true" className="fixed inset-0 z-[5] bg-page" />
        <div
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onClick={() => setChromeHidden((hidden) => !hidden)}
          className={
            chromeHidden
              ? "fixed inset-0 z-30 flex items-center justify-center bg-page p-2"
              : "fixed inset-x-0 bottom-[66px] top-[72px] z-20 flex items-center justify-center px-2 py-2"
          }
        >
          <div className="relative flex h-full w-full items-center justify-center">
            {under && under.id !== photo.id && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`under-${under.id}`}
                src={under.med}
                srcSet={`${under.med} 1280w, ${under.full} 2560w`}
                sizes="100vw"
                alt=""
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 h-full w-full object-contain"
              />
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={photo.id}
              src={photo.med}
              srcSet={`${photo.med} 1280w, ${photo.full} 2560w`}
              sizes="100vw"
              alt={photo.caption || file.title}
              decoding="async"
              onLoad={() => setLoaded(photo.id)}
              className={`relative h-full w-full object-contain transition-opacity duration-200 motion-reduce:transition-none ${
                loaded === photo.id || !under ? "opacity-100" : "opacity-0"
              }`}
            />
          </div>
        </div>

        {!chromeHidden && (
          <div className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-2 border-t border-border-strong bg-page/95 px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 backdrop-blur-sm">
            <span className="flex shrink-0 items-center">
              <button type="button" onClick={() => onStep(-1)} disabled={index === 0} aria-label={t("prevPhoto")} className={square}>←</button>
              <span className={`${metaLabel} px-1`}>
                <span className="text-fg">{pad(index + 1)}</span> / {pad(total)}
              </span>
              <button type="button" onClick={() => onStep(1)} disabled={index === total - 1} aria-label={t("nextPhoto")} className={square}>→</button>
            </span>
            <p className="min-w-0 flex-1 truncate text-xs text-fg-muted">{photo.caption || file.title}</p>
            <button
              type="button"
              onClick={() => setInfoOpen(true)}
              aria-expanded={infoOpen}
              className="font-meta inline-flex min-h-10 shrink-0 items-center gap-1.5 border border-border-strong px-3 text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-fg"
            >
              {t("photoInfo")} <span aria-hidden="true">↑</span>
            </button>
          </div>
        )}

        {infoOpen && (
          <>
            <div aria-hidden="true" onClick={() => setInfoOpen(false)} className="fixed inset-0 z-30 bg-page/55 backdrop-blur-[2px]" />
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="album3d-photo-title"
              className="fixed inset-x-0 bottom-0 z-40 max-h-[72dvh] overflow-y-auto overscroll-contain border-t border-border-strong bg-page px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-4"
            >
              <div className="flex items-center justify-between gap-3">
                <p className={metaLabel}>{t("printCount", { current: pad(index + 1), total: pad(total) })}</p>
                <button type="button" onClick={() => setInfoOpen(false)} aria-label={tc("close")} className={square}>×</button>
              </div>
              {infoContent}
            </section>
          </>
        )}
      </main>
    );
  }

  return (
    <main id="main-content" tabIndex={-1} className="outline-none">
      {rect && (
        <div
          className="pointer-events-none absolute"
          style={{ left: rect.left, top: rect.top, width: rect.right - rect.left, height: rect.bottom - rect.top }}
        >
          {under && under.id !== photo.id && printUp && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`under-${under.id}`}
              src={under.med}
              srcSet={`${under.med} 1280w, ${under.full} 2560w`}
              sizes="64vw"
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-contain"
            />
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={photo.id}
            src={photo.med}
            srcSet={`${photo.med} 1280w, ${photo.full} 2560w`}
            sizes="64vw"
            alt={photo.caption || file.title}
            decoding="async"
            onLoad={() => setLoaded(photo.id)}
            className={`relative h-full w-full object-contain transition-opacity duration-300 motion-reduce:transition-none ${
              loaded === photo.id && printUp ? "opacity-100" : "opacity-0"
            }`}
          />
        </div>
      )}

      <section aria-labelledby="album3d-photo-title" className={styles.photoInfo}>
        <div className="flex items-center gap-3">
          <p className={metaLabel}>{t("printCount", { current: pad(index + 1), total: pad(total) })}</p>
          <span className="ml-auto flex">
            <button type="button" onClick={() => onStep(-1)} disabled={index === 0} aria-label={t("prevPhoto")} className={square}>←</button>
            <button type="button" onClick={() => onStep(1)} disabled={index === total - 1} aria-label={t("nextPhoto")} className={square}>→</button>
          </span>
        </div>
        {infoContent}
      </section>
    </main>
  );
}
