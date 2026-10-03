"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { pad } from "./hud";
import styles from "./ArchiveSite.module.css";
import { fileCode, type ArchiveFile } from "./types";

const metaLabel = "font-meta text-[0.625rem] uppercase tracking-[0.16em] text-fg-subtle";

/**
 * The 360° study of one album: the scene holds the assembly, and this layer
 * carries its header, the cover and explode switches and the parts list.
 */
export default function StudyScreen({
  file,
  owner,
  exploded,
  clear,
  touch,
  onBack,
  onExplode,
  onClear,
  onReset
}: {
  file: ArchiveFile;
  owner: string;
  exploded: boolean;
  clear: boolean;
  touch: boolean;
  onBack: () => void;
  onExplode: (exploded: boolean) => void;
  onClear: (clear: boolean) => void;
  onReset: () => void;
}) {
  const t = useTranslations("album3d");
  const code = fileCode(file.number);
  const parts = [
    t("partScrews"),
    t("partCover"),
    t("partPrints", { count: file.prints.length }),
    t("partSubstrate"),
    t("partCarrier")
  ];

  return (
    <main id="main-content" tabIndex={-1} className="outline-none">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,transparent_45%,color-mix(in_srgb,var(--color-page)_38%,transparent)_85%)]" />
      <header className={`${styles.studyHeader} pointer-events-none flex items-start`}>
        <button
          type="button"
          onClick={onBack}
          className="pointer-events-auto flex min-h-11 items-center gap-3 py-3 text-xl transition hover:text-accent-text wide:gap-5"
        >
          <span aria-hidden="true">←</span>
          <span className="text-sm wide:text-[0.9375rem]">{t("backToFile")}</span>
          <kbd className="font-meta ml-2 hidden border border-border-strong p-1 text-[0.625rem] text-fg-subtle wide:inline">ESC</kbd>
        </button>
        <div className="ml-16 hidden pt-3 wide:block">
          <p className={metaLabel}>{t("archiveLabel")} / {t("study")}</p>
          <h1 className="mb-2 mt-2.5 text-[1.9rem] font-semibold">{file.title}</h1>
          <p className="font-meta text-[0.6875rem] uppercase tracking-[0.08em] text-fg-subtle">
            {code} / {owner}
          </p>
        </div>
        <p aria-hidden="true" className="ml-auto hidden text-[3.625rem] font-light leading-none text-fg-muted wide:block">
          360<span className="align-top text-[2rem]">°</span>
        </p>
      </header>

      <div className="pointer-events-none absolute inset-x-[var(--edge)] top-20 wide:hidden">
        <p className={metaLabel}>{code} / {owner}</p>
        <h1 aria-hidden="true" className="mt-1 text-lg font-semibold">{file.title}</h1>
      </div>

      <div role="group" aria-label={t("cover")} className={`${styles.surface} flex border border-fg/30 bg-page/70`}>
        {([true, false] as const).map((value) => (
          <button
            key={String(value)}
            type="button"
            aria-pressed={clear === value}
            onClick={() => onClear(value)}
            className={`min-h-11 px-4 text-xs transition wide:px-5 wide:text-sm ${clear === value ? "bg-fg text-page" : "hover:bg-control"}`}
          >
            {value ? t("coverClear") : t("coverFrosted")}
          </button>
        ))}
      </div>

      <aside
        aria-label={t("assembly")}
        className={`${styles.parts} pointer-events-none transition duration-400 motion-reduce:transition-none ${exploded ? "translate-x-0 opacity-100" : "translate-x-3 opacity-0"}`}
      >
        <p className="font-meta mb-6 text-[0.6875rem] uppercase tracking-[0.08em] text-fg-subtle">{t("assembly")}</p>
        <ol>
          {parts.map((part, i) => (
            <li key={part} className="relative mb-4 border-b border-border pb-4 pl-10 text-base">
              <span className="font-meta absolute left-0 top-0.5 text-[0.6875rem] text-fg-subtle">{pad(i + 1)}</span>
              {part}
            </li>
          ))}
        </ol>
      </aside>

      <div className={`${styles.studyFooter} flex flex-col items-center gap-3 wide:flex-row wide:justify-between`}>
        <p className="font-meta hidden w-1/4 flex-wrap gap-x-5 text-xs text-fg-subtle wide:flex">
          <span>{t("studyHintDrag")}</span>
          {touch ? <span>{t("studyHintPinch")}</span> : (
            <>
              <span>{t("studyHintPan")}</span>
              <span>{t("studyHintZoom")}</span>
            </>
          )}
        </p>
        <div role="group" aria-label={t("study")} className="flex border border-fg/40 bg-page">
          <button
            type="button"
            aria-pressed={exploded}
            onClick={() => onExplode(true)}
            className={`min-h-12 min-w-36 px-5 text-sm transition wide:min-h-[3.75rem] wide:min-w-[10.375rem] wide:text-[0.9375rem] ${exploded ? "bg-fg text-page" : "hover:bg-control"}`}
          >
            <span aria-hidden="true" className="mr-2.5">＋</span>
            {t("explode")}
          </button>
          <button
            type="button"
            aria-pressed={!exploded}
            onClick={() => onExplode(false)}
            className={`min-h-12 min-w-36 px-5 text-sm transition wide:min-h-[3.75rem] wide:min-w-[10.375rem] wide:text-[0.9375rem] ${!exploded ? "bg-fg text-page" : "hover:bg-control"}`}
          >
            <span aria-hidden="true" className="mr-2.5">−</span>
            {t("reassemble")}
          </button>
        </div>
        <div className="flex items-center gap-6 wide:w-1/4 wide:justify-end">
          <button type="button" onClick={onReset} className="inline-flex min-h-11 items-center gap-3 text-sm hover:text-accent-text">
            {t("resetView")} <span aria-hidden="true">↺</span>
          </button>
          <Link href={file.href} className="inline-flex min-h-11 items-center gap-2 text-sm text-fg-muted hover:text-fg">
            {t("viewAlbum")} <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </div>
      <p role="status" className="font-meta absolute bottom-2 left-1/2 hidden -translate-x-1/2 text-[0.6875rem] uppercase tracking-[0.08em] text-fg-subtle wide:block">
        {exploded ? t("exploded") : t("assembled")}
      </p>
    </main>
  );
}
