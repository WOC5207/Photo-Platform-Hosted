"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Dialog from "@/components/ui/Dialog";
import { type ArchiveColumn, type ArchiveFile } from "./types";

/**
 * The archive's search overlay: filter by photographer, match album titles in
 * either language or photographer names.
 */
export default function ArchiveIndex({
  open,
  onClose,
  files,
  columns,
  onSelect,
  onOpen
}: {
  open: boolean;
  onClose: () => void;
  files: ArchiveFile[];
  columns: ArchiveColumn[];
  onSelect: (index: number) => void;
  onOpen: (index: number) => void;
}) {
  const t = useTranslations("album3d");
  const [query, setQuery] = useState("");
  const [column, setColumn] = useState<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Dialog focuses its first control (Close); searching is why it opened.
  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return files
      .map((file, index) => ({ file, index }))
      .filter(({ file }) => column === null || file.column === column)
      .filter(({ file }) => {
        if (!q) return true;
        return [file.title, file.altTitle, columns[file.column]?.name ?? ""]
          .some((text) => text.toLowerCase().includes(q));
      });
  }, [files, columns, query, column]);

  const chip = (active: boolean) =>
    `inline-flex min-h-9 items-center gap-1.5 text-xs transition ${active ? "font-semibold text-fg" : "text-fg-subtle hover:text-fg"}`;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      label={t("index")}
      overlayClassName="!bg-page/55 backdrop-blur-md"
      panelClassName="flex h-[min(42rem,calc(100dvh-2rem))] max-w-4xl flex-col !rounded-none !border-border bg-surface px-5 py-6 sm:px-10 sm:py-8"
    >
      <div className="flex items-center justify-between border-b border-border pb-4">
        <p className="font-meta text-[0.625rem] uppercase tracking-[0.16em] text-fg-muted">{t("indexDirectory")}</p>
        <button type="button" onClick={onClose} className="inline-flex min-h-10 items-center gap-2 text-xs uppercase tracking-[0.1em]">
          {t("close")} <span aria-hidden="true" className="text-lg">×</span>
        </button>
      </div>

      <div className="mt-6 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="text-3xl font-extrabold uppercase tracking-[-0.02em] sm:text-4xl">{t("index")}</h2>
        <p className="text-xs tracking-[0.12em] text-fg-subtle">{t("indexSubtitle")}</p>
      </div>

      <label className="mt-6 flex items-center gap-3 border-b-2 border-fg pb-2 focus-within:border-accent">
        <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="9.5" cy="6.5" r="4.5" />
          <path d="m6.2 9.8-4.7 4.7" />
        </svg>
        <span className="sr-only">{t("search")}</span>
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search")}
          className="min-h-10 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-fg-faint focus-visible:outline-none! [&::-webkit-search-cancel-button]:appearance-none"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} aria-label={t("clear")} className="grid h-9 w-9 place-items-center text-accent-text">
            ×
          </button>
        )}
        <kbd className="font-meta hidden rounded border border-border-strong px-1.5 py-0.5 text-[0.5625rem] text-fg-subtle sm:inline">ESC</kbd>
      </label>

      <div role="group" aria-label={t("colPhotographer")} className="mt-3 flex flex-wrap gap-x-5 border-b border-border pb-2">
        <button type="button" aria-pressed={column === null} onClick={() => setColumn(null)} className={chip(column === null)}>
          {column === null && <span aria-hidden="true" className="h-1 w-1 rounded-full bg-fg" />}
          {t("all")}
        </button>
        {columns.map((c, i) => (
          <button key={c.username} type="button" aria-pressed={column === i} onClick={() => setColumn(i)} className={chip(column === i)}>
            {column === i && <span aria-hidden="true" className="h-1 w-1 rounded-full bg-fg" />}
            {c.name}
          </button>
        ))}
      </div>

      <div className="mt-3 hidden grid-cols-[1fr_10rem_5rem_2.75rem] border-b border-border pb-2 font-meta text-[0.5625rem] uppercase tracking-[0.14em] text-fg-subtle sm:grid">
        <span>{t("colAlbum")}</span>
        <span>{t("colPhotographer")}</span>
        <span>{t("colPhotos")}</span>
        <span />
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {matches.length === 0 ? (
          <li className="py-10 text-center text-sm text-fg-subtle">{t("noRecords")}</li>
        ) : (
          matches.map(({ file, index }) => (
            <li key={file.id} className="grid grid-cols-[1fr_2.75rem] items-center border-b border-border sm:grid-cols-[1fr_2.75rem]">
              <button
                type="button"
                onClick={() => onSelect(index)}
                className="grid min-h-14 grid-cols-[1fr] items-center gap-x-2 py-2 text-left hover:bg-fg/5 sm:grid-cols-[1fr_10rem_5rem]"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{file.title}</span>
                  {file.altTitle && file.altTitle !== file.title && (
                    <span className="block truncate text-[0.6875rem] text-fg-subtle">{file.altTitle}</span>
                  )}
                  <span className="block truncate text-[0.6875rem] text-fg-subtle sm:hidden">
                    {columns[file.column]?.name} · {t("photos", { count: file.photoCount })}
                  </span>
                </span>
                <span className="hidden truncate text-xs text-fg-muted sm:block">{columns[file.column]?.name}</span>
                <span className="font-meta hidden text-xs text-fg-muted sm:block">{file.photoCount}</span>
              </button>
              <button
                type="button"
                onClick={() => onOpen(index)}
                aria-label={t("openStudy", { title: file.title })}
                className="grid h-11 w-11 place-items-center text-lg hover:bg-fg/5"
              >
                ↗
              </button>
            </li>
          ))
        )}
      </ul>

      <div className="flex items-center justify-between pt-4 font-meta text-[0.5625rem] uppercase tracking-[0.14em] text-fg-subtle">
        <p role="status">{t("records", { count: matches.length })}</p>
        <p className="flex items-center gap-2">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />
          {t("connected")}
        </p>
      </div>
    </Dialog>
  );
}
