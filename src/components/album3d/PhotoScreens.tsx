"use client";

import { useEffect, useState, useTransition } from "react";
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
  onOpen,
  onBack,
  classicHref
}: {
  file: ArchiveFile;
  owner: string;
  username: string;
  album: AlbumPhotos | null;
  focus: number;
  onOpen: (index: number) => void;
  onBack: () => void;
  classicHref: string;
}) {
  const t = useTranslations("album3d");
  const total = album?.photos.length ?? 0;

  return (
    <main id="main-content" tabIndex={-1} className={`${styles.menuPanel} outline-none`}>
      <p className={metaLabel}>
        {owner}
      </p>
      <h1 className="mt-3 text-[2.25rem] font-extrabold uppercase leading-[0.95] tracking-[-0.04em] [overflow-wrap:anywhere] wide:text-[3.75rem]">
        {file.title}
      </h1>
      <div aria-hidden="true" className={styles.calloutRule} />
      {!album ? (
        <p role="status" className={`${metaLabel} mt-8`}>{t("loadingPhotos")}</p>
      ) : total === 0 ? (
        <p className="mt-8 text-sm text-fg-muted">{t("noPhotos")}</p>
      ) : (
        <>
          <div className="mt-6">
            <p className={metaLabel}>{t("lightTable")}</p>
            <p className="mt-1 flex items-baseline gap-3">
              <span className="text-[2.125rem] leading-none wide:text-[3rem]">
                <Rolling value={pad(focus + 1)} />
              </span>
              <span aria-hidden="true" className="text-xl font-light text-fg-subtle">/</span>
              <span className="text-sm text-fg-muted wide:text-[1.375rem]">{pad(total)}</span>
              <span className="sr-only">{t("printCount", { current: focus + 1, total })}</span>
            </p>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-x-10 gap-y-2">
            <button
              type="button"
              onClick={() => onOpen(focus)}
              className="group inline-flex min-h-11 items-center gap-12 text-sm font-medium uppercase tracking-[0.07em]"
            >
              {t("openPhoto")}
              <span aria-hidden="true" className="text-2xl transition-transform group-hover:translate-x-2 motion-reduce:transition-none">→</span>
            </button>
            <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-2 text-sm text-fg-muted hover:text-fg">
              <span aria-hidden="true">←</span> {t("backToFile")}
            </button>
          </div>
          {album.more > 0 && (
            <p className="mt-4 text-xs text-fg-muted">
              <Link href={classicHref} className="underline-offset-4 hover:text-fg hover:underline">
                {t("morePhotos", { count: album.more })} ↗
              </Link>
            </p>
          )}
          <ol aria-label={t("lightTable")} className="sr-only">
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
  printUp,
  classicHref
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
  classicHref: string;
}) {
  const t = useTranslations("album3d");
  const photo = album.photos[index];
  const total = album.photos.length;
  const [viewport, setViewport] = useState<{ width: number; height: number } | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [cover, setCover] = useState(album.coverId);
  const [saving, startSaving] = useTransition();
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

  const rect = viewport ? photoRect(viewport.width, viewport.height) : null;
  const shootLine = [photo.exif.focalLength, photo.exif.exposure, photo.exif.date].filter(Boolean).join(" · ");

  return (
    <main id="main-content" tabIndex={-1} className="outline-none">
      {rect && (
        <div
          className="pointer-events-none absolute"
          style={{ left: rect.left, top: rect.top, width: rect.right - rect.left, height: rect.bottom - rect.top }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={photo.id}
            src={photo.med}
            srcSet={`${photo.med} 1280w, ${photo.full} 2560w`}
            sizes="64vw"
            alt={photo.caption || file.title}
            decoding="async"
            onLoad={() => setLoaded(photo.id)}
            className={`h-full w-full object-contain transition-opacity duration-300 motion-reduce:transition-none ${
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
              <li key={i}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-9 items-center border border-border-strong px-3 text-xs uppercase tracking-[0.08em] hover:border-fg"
                >
                  {link.label} <span aria-hidden="true" className="ml-2">↗</span>
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
            <span aria-hidden="true" className="text-xl">←</span> {t("backToTable")}
            <kbd className="font-meta hidden border border-border-strong p-1 text-[0.625rem] text-fg-subtle wide:inline">ESC</kbd>
          </button>
          <Link href={classicHref} className="inline-flex min-h-11 items-center gap-2 text-sm text-fg-muted hover:text-fg">
            {t("photoClassic")} <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
