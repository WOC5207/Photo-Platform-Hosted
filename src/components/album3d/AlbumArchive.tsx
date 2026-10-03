"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import EmptyState from "@/components/ui/EmptyState";
import ArchiveIndex from "./ArchiveIndex";
import { fileCode, type ArchiveColumn, type ArchiveFile } from "./types";
import type { ArchiveEngine, EnginePalette } from "./engine";

export type { ArchiveColumn, ArchiveFile, ArchivePrint } from "./types";

type EngineStatus = "loading" | "ready" | "unsupported";

function webglAvailable(): boolean {
  try {
    const probe = document.createElement("canvas");
    return Boolean(probe.getContext("webgl2") ?? probe.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Resolves any CSS colour (hex, rgb, oklch…) to an `rgb()` string. */
function resolveColor(ctx: CanvasRenderingContext2D, value: string, fallback: string): string {
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = fallback;
  ctx.fillStyle = value.trim() || fallback;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `rgb(${r}, ${g}, ${b})`;
}

function readPalette(element: HTMLElement): EnginePalette {
  const style = getComputedStyle(element);
  const probe = document.createElement("canvas");
  probe.width = 1;
  probe.height = 1;
  const ctx = probe.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
  const token = (name: string, fallback: string) =>
    resolveColor(ctx, style.getPropertyValue(name), fallback);
  return {
    page: token("--color-page", "#ece8e0"),
    surface: token("--color-surface", "#f4f1ea"),
    raised: token("--color-raised", "#faf8f3"),
    control: token("--color-control", "#e4dfd5"),
    fg: token("--color-fg", "#1f1b16"),
    subtle: token("--color-fg-subtle", "#7a7064"),
    accent: token("--color-accent", "#b98b4e"),
    fontMeta: style.getPropertyValue("--font-meta").trim() || "monospace",
    fontSans: style.getPropertyValue("--font-sans").trim() || "sans-serif"
  };
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function isInteractive(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest("a, button, input, select, textarea"));
}

/**
 * Prototype homepage gallery as a three.js archive (see engine.ts).
 *
 * Columns are photographers and files are their albums. Every control on the
 * canvas has a real button or link in the overlay, so keyboard and screen
 * reader visitors get the same archive without needing the 3D view at all.
 */
export default function AlbumArchive({
  files,
  columns
}: {
  files: ArchiveFile[];
  columns: ArchiveColumn[];
}) {
  const t = useTranslations("album3d");
  const tc = useTranslations("common");
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ArchiveEngine | null>(null);
  const [status, setStatus] = useState<EngineStatus>("loading");
  const [selected, setSelected] = useState(0);
  const [mode, setMode] = useState<"field" | "study">("field");
  const [exploded, setExploded] = useState(false);
  const [indexOpen, setIndexOpen] = useState(false);
  const [touch, setTouch] = useState(false);

  const file = files[selected];
  const column = file ? columns[file.column] : undefined;
  const slot = column ? column.fileIndexes.indexOf(selected) : 0;

  const step = useCallback(
    (axis: "file" | "column", direction: 1 | -1) => {
      setSelected((current) => {
        const currentFile = files[current];
        if (!currentFile) return current;
        if (axis === "file") {
          // Wrap through the whole archive, photographer by photographer.
          const order = columns.flatMap((c) => c.fileIndexes);
          const at = order.indexOf(current);
          return order[(at + direction + order.length) % order.length];
        }
        const from = columns[currentFile.column];
        const to = columns[(currentFile.column + direction + columns.length) % columns.length];
        const at = from.fileIndexes.indexOf(current);
        return to.fileIndexes[Math.min(at, to.fileIndexes.length - 1)];
      });
    },
    [files, columns]
  );

  const openStudy = useCallback((index: number) => {
    setSelected(index);
    setExploded(false);
    setMode("study");
  }, []);

  const closeStudy = useCallback(() => {
    setMode("field");
    setExploded(false);
  }, []);

  // Latest callbacks for the engine, which is created once.
  const handlers = useRef({ step, openStudy, pick: setSelected });
  useEffect(() => {
    handlers.current = { step, openStudy, pick: setSelected };
  }, [step, openStudy]);

  // Create the engine once; three.js loads only after the overlay is up.
  useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root || files.length === 0) return;
    if (!webglAvailable()) {
      setStatus("unsupported");
      return;
    }
    let disposed = false;
    const compactQuery = window.matchMedia("(max-width: 767px)");
    const coarse = window.matchMedia("(pointer: coarse)");
    setTouch(coarse.matches);

    import("./engine")
      .then(({ createArchiveEngine }) => {
        if (disposed) return;
        const engine = createArchiveEngine(canvas, {
          files: files.map((f) => ({
            number: f.number,
            column: f.column,
            title: f.title,
            owner: columns[f.column]?.name ?? "",
            meta: [f.dateLabel, t("photos", { count: f.photoCount })].filter(Boolean).join(" · "),
            prints: f.prints
          })),
          columns: columns.map((c) => c.fileIndexes),
          palette: readPalette(root),
          reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
          compact: compactQuery.matches,
          archiveLabel: t("archiveLabel"),
          onPick: (index) => handlers.current.pick(index),
          onOpen: (index) => handlers.current.openStudy(index),
          onStep: (axis, direction) => handlers.current.step(axis, direction)
        });
        engineRef.current = engine;
        setStatus("ready");
      })
      .catch(() => {
        if (!disposed) setStatus("unsupported");
      });

    const syncCompact = () => engineRef.current?.setCompact(compactQuery.matches);
    compactQuery.addEventListener("change", syncCompact);

    // Follow the theme toggle and the admin's public palette.
    const syncPalette = () => {
      // The theme class lands before the new custom properties apply.
      requestAnimationFrame(() => engineRef.current?.setPalette(readPalette(root)));
    };
    const observer = new MutationObserver(syncPalette);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    scheme.addEventListener("change", syncPalette);

    return () => {
      disposed = true;
      compactQuery.removeEventListener("change", syncCompact);
      scheme.removeEventListener("change", syncPalette);
      observer.disconnect();
      engineRef.current?.dispose();
      engineRef.current = null;
    };
    // The archive is fixed for the life of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status === "ready") engineRef.current?.select(selected);
  }, [selected, status]);

  useEffect(() => {
    const engine = engineRef.current;
    if (status !== "ready" || !engine) return;
    if (mode === "study") engine.openObject(selected);
    else engine.closeObject();
    // Opening is keyed to the mode switch, not to later selection changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, status]);

  useEffect(() => {
    if (status === "ready") engineRef.current?.setExploded(exploded);
  }, [exploded, status]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (indexOpen || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTyping(e.target)) return;
      if (mode === "study") {
        if (e.key === "Escape") {
          e.preventDefault();
          closeStudy();
        }
        return;
      }
      const keys: Record<string, () => void> = {
        ArrowUp: () => step("file", -1),
        ArrowDown: () => step("file", 1),
        ArrowLeft: () => step("column", -1),
        ArrowRight: () => step("column", 1),
        "/": () => setIndexOpen(true)
      };
      if (e.key === "Enter" && !isInteractive(e.target)) {
        e.preventDefault();
        openStudy(selected);
        return;
      }
      const action = keys[e.key];
      if (!action) return;
      e.preventDefault();
      action();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [indexOpen, mode, selected, step, openStudy, closeStudy]);

  if (files.length === 0 || !file || !column) {
    return (
      <main id="main-content" className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center px-4 py-10">
        <EmptyState title={t("empty")} description={t("emptyHint")}
          action={<Link href="/" className="text-sm font-semibold text-accent-text underline">{t("classic")}</Link>}
        />
      </main>
    );
  }

  const meta = (
    <span className="font-meta text-[0.6875rem] uppercase tracking-[0.16em] text-fg-subtle">
      {t("archiveLabel")} <span aria-hidden="true">/</span> {column.name}
    </span>
  );

  return (
    <div ref={rootRef} className="album3d relative h-dvh w-full overflow-hidden bg-page text-fg">
      <div
        aria-hidden="true"
        className={`absolute inset-0 transition-opacity duration-500 motion-reduce:transition-none ${status === "ready" ? "opacity-100" : "opacity-0"}`}
      >
        <canvas ref={canvasRef} className="block h-full w-full touch-none select-none" />
      </div>

      {status === "loading" && (
        <p role="status" className="font-meta absolute inset-0 flex items-center justify-center text-xs uppercase tracking-[0.2em] text-fg-subtle">
          {t("loading")}
        </p>
      )}

      {/* Edge washes keep the overlay legible over the field. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-page/90 to-transparent" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 bg-gradient-to-l from-page/85 via-page/55 to-transparent md:block" />
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-page to-transparent md:h-48 md:from-0% md:via-page/60 md:via-50% ${mode === "field" ? "h-[34rem] from-30% via-page/85 via-60%" : "h-40"}`}
      />

      <header className="absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-4 px-4 pt-4 sm:px-8 sm:pt-7 lg:px-10 lg:pt-9">
        {mode === "field" ? (
          <Link href="/" className="group block leading-none">
            <span className="block text-2xl font-extrabold uppercase tracking-[-0.02em] sm:text-4xl">{t("brandTop")}</span>
            <span className="mt-1 block text-[0.625rem] font-semibold uppercase tracking-[0.08em] text-fg-muted sm:text-xs">{t("brandMiddle")}</span>
            <span className="mt-1 block text-lg font-light uppercase tracking-[0.02em] sm:text-2xl">
              {t("brandBottom")}
            </span>
          </Link>
        ) : (
          <div className="flex items-start gap-5 sm:gap-10">
            <button
              type="button"
              onClick={closeStudy}
              className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-fg-muted transition hover:text-fg"
            >
              <span aria-hidden="true">←</span>
              {t("back")}
              <kbd className="font-meta hidden rounded border border-border-strong px-1 text-[0.5625rem] sm:inline">ESC</kbd>
            </button>
            <div className="hidden sm:block">
              <p className="font-meta text-[0.625rem] uppercase tracking-[0.18em] text-fg-subtle">{t("archiveLabel")} / {t("study")}</p>
              <p aria-hidden="true" className="mt-1 text-xl font-bold">{file.title}</p>
              <p className="font-meta mt-1 text-[0.625rem] uppercase tracking-[0.14em] text-fg-subtle">
                {fileCode(file.number)} / {column.name}
              </p>
            </div>
          </div>
        )}
        <nav aria-label={t("brandBottom")} className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-3">
          {mode === "field" && (
            <button
              type="button"
              onClick={() => setIndexOpen(true)}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-xs font-semibold uppercase tracking-[0.1em] transition hover:bg-fg/5"
            >
              <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
                <circle cx="9.5" cy="6.5" r="4.5" />
                <path d="m6.2 9.8-4.7 4.7" />
              </svg>
              <span className="hidden sm:inline">{t("index")}</span>
              <span className="sr-only sm:hidden">{t("index")}</span>
              <kbd className="font-meta hidden rounded border border-border-strong px-1 text-[0.625rem] font-normal sm:inline">/</kbd>
            </button>
          )}
          <Link
            href="/"
            className="hidden min-h-10 items-center rounded-lg px-2 text-xs font-semibold uppercase tracking-[0.1em] text-fg-muted transition hover:bg-fg/5 hover:text-fg sm:inline-flex"
          >
            {t("classic")}
          </Link>
          <LanguageSwitcher />
          <ThemeToggle label={tc("toggleTheme")} />
        </nav>
      </header>

      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {t("announce", {
          title: file.title,
          owner: column.name,
          current: slot + 1,
          total: column.fileIndexes.length
        })}
      </p>

      {mode === "field" ? (
        <main id="main-content" tabIndex={-1} className="outline-none">
          {/* The selected file. Right of the raised panel on wide screens,
              a sheet under it on phones. */}
          <section
            aria-labelledby="album3d-title"
            className="absolute inset-x-4 bottom-[8.5rem] sm:inset-x-8 md:inset-x-auto md:bottom-auto md:left-[52%] md:right-0 md:top-[40%]"
          >
            {meta}
            <h1 id="album3d-title" className="mt-2 text-2xl font-bold leading-tight tracking-[-0.01em] sm:text-3xl md:pr-10 lg:text-4xl">
              <span className="sr-only">{t("fileNumber")} {fileCode(file.number)}: </span>
              {file.title}
            </h1>
            {file.altTitle && file.altTitle !== file.title && (
              <p className="mt-1 text-sm text-fg-muted">{file.altTitle}</p>
            )}
            <div className="mt-4 flex items-center gap-3 md:mt-6">
              <span aria-hidden="true" className="h-1 w-1 bg-fg" />
              <span aria-hidden="true" className="h-px flex-1 bg-fg/40" />
            </div>
            <p className="mt-3 flex items-baseline justify-between gap-4 text-sm md:mt-4 md:max-w-xl md:pl-10">
              <span className="font-medium">
                {file.dateLabel || t("noDate")}
                {file.location ? ` · ${file.location}` : ""}
              </span>
              <span className="font-meta shrink-0 text-[0.6875rem] uppercase tracking-[0.14em] text-fg-subtle">
                {fileCode(file.number)} · {t("photos", { count: file.photoCount })}
              </span>
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-8 gap-y-1 md:mt-6 md:pl-10">
              <button
                type="button"
                onClick={() => openStudy(selected)}
                disabled={status !== "ready"}
                className="group inline-flex min-h-11 items-center gap-4 text-sm font-semibold uppercase tracking-[0.08em] disabled:opacity-40"
              >
                {t("openFile")}
                <span aria-hidden="true" className="text-xl transition-transform group-hover:translate-x-1 motion-reduce:transition-none">→</span>
              </button>
              <Link
                href={file.href}
                className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-fg-muted underline-offset-4 hover:text-fg hover:underline"
              >
                {t("viewAlbum")} <span aria-hidden="true">↗</span>
              </Link>
            </div>
          </section>

          {/* Navigation strip. */}
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 px-4 pb-4 sm:px-8 sm:pb-6 lg:px-10">
            <div className="shrink-0">
              <p className="font-meta text-[0.5625rem] uppercase tracking-[0.18em] text-fg-subtle">{t("select")}</p>
              <p className="mt-1 flex items-baseline gap-2 tabular-nums md:mt-2 md:gap-4">
                <span className="text-3xl font-light md:text-5xl">{String(slot + 1).padStart(2, "0")}</span>
                <span aria-hidden="true" className="text-fg-subtle">/</span>
                <span className="text-sm text-fg-muted">{String(column.fileIndexes.length).padStart(2, "0")}</span>
              </p>
            </div>

            <div className="hidden items-center gap-4 md:flex">
              <button type="button" onClick={() => step("file", -1)} aria-label={t("prevFile")} className="grid h-10 w-10 place-items-center rounded-lg text-xl hover:bg-fg/5">↑</button>
              <ol aria-hidden="true" className="flex h-6 items-end gap-2.5">
                {column.fileIndexes.map((index, i) => (
                  <li key={index} className={`w-px ${index === selected ? "h-6 bg-fg" : "h-3 bg-fg/30"}`} data-i={i} />
                ))}
              </ol>
              <button type="button" onClick={() => step("file", 1)} aria-label={t("nextFile")} className="grid h-10 w-10 place-items-center rounded-lg text-xl hover:bg-fg/5">↓</button>
            </div>

            <div className="flex min-w-0 items-center gap-1 sm:gap-3">
              <button type="button" onClick={() => step("file", -1)} aria-label={t("prevFile")} className="grid h-11 w-11 place-items-center rounded-lg text-lg hover:bg-fg/5 md:hidden">↑</button>
              <button type="button" onClick={() => step("file", 1)} aria-label={t("nextFile")} className="grid h-11 w-11 place-items-center rounded-lg text-lg hover:bg-fg/5 md:hidden">↓</button>
              {columns.length > 1 && (
                <>
                  <button type="button" onClick={() => step("column", -1)} aria-label={t("prevColumn")} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-lg hover:bg-fg/5">←</button>
                  <div className="hidden min-w-0 sm:block">
                    <p className="font-meta text-[0.5625rem] uppercase tracking-[0.16em] text-fg-subtle">
                      {t("photographerCount", { current: String(file.column + 1).padStart(2, "0"), total: String(columns.length).padStart(2, "0") })}
                    </p>
                    <p className="truncate text-sm font-medium">{column.name}</p>
                  </div>
                  <button type="button" onClick={() => step("column", 1)} aria-label={t("nextColumn")} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-accent-surface text-lg hover:bg-accent/20">→</button>
                </>
              )}
            </div>
          </div>

          <p className="font-meta pointer-events-none absolute inset-x-0 bottom-1.5 hidden text-center text-[0.5625rem] uppercase tracking-[0.14em] text-fg-subtle md:block">
            {touch ? (
              t("hintTouch")
            ) : (
              <>
                ← → {t("hintPhotographer")} <span aria-hidden="true">/</span> ↑ ↓ {t("hintAlbum")}{" "}
                <span aria-hidden="true">/</span> ENTER {t("hintOpen")} <span aria-hidden="true">/</span> / {t("hintIndex")}
              </>
            )}
          </p>
        </main>
      ) : (
        <main id="main-content" tabIndex={-1} className="outline-none">
          <div className="absolute inset-x-4 top-16 sm:hidden">
            <p className="font-meta text-[0.625rem] uppercase tracking-[0.14em] text-fg-subtle">
              {fileCode(file.number)} / {column.name}
            </p>
            <h1 className="mt-1 text-xl font-bold">{file.title}</h1>
          </div>
          <p aria-hidden="true" className="pointer-events-none absolute right-4 top-20 text-5xl font-extralight text-fg/25 sm:right-10 sm:top-24 sm:text-7xl">
            360°
          </p>
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 px-4 pb-5 sm:pb-8">
            <div className="flex w-full items-end justify-center gap-4 sm:justify-between">
              <p className="font-meta hidden text-[0.625rem] uppercase tracking-[0.12em] text-fg-subtle sm:block sm:w-1/3">
                {t("studyHintDrag")} · {touch ? t("studyHintPinch") : `${t("studyHintPan")} · ${t("studyHintZoom")}`}
              </p>
              <div className="flex flex-col items-center gap-2">
                <div role="group" aria-label={t("study")} className="flex overflow-hidden rounded-sm border border-fg/20">
                  <button
                    type="button"
                    aria-pressed={exploded}
                    onClick={() => setExploded(true)}
                    className={`min-h-11 px-5 text-sm font-medium transition sm:px-8 ${exploded ? "bg-fg text-page" : "bg-raised/80 hover:bg-raised"}`}
                  >
                    <span aria-hidden="true" className="mr-3">+</span>{t("explode")}
                  </button>
                  <button
                    type="button"
                    aria-pressed={!exploded}
                    onClick={() => setExploded(false)}
                    className={`min-h-11 px-5 text-sm font-medium transition sm:px-8 ${!exploded ? "bg-fg text-page" : "bg-raised/80 hover:bg-raised"}`}
                  >
                    <span aria-hidden="true" className="mr-3">−</span>{t("reassemble")}
                  </button>
                </div>
                <p role="status" className="font-meta text-[0.625rem] uppercase tracking-[0.14em] text-fg-subtle">
                  {exploded ? t("exploded") : t("assembled")}
                </p>
              </div>
              <div className="hidden flex-col items-end gap-1 sm:flex sm:w-1/3">
                <button type="button" onClick={() => engineRef.current?.resetView()} className="inline-flex min-h-10 items-center gap-2 text-sm hover:underline">
                  {t("resetView")} <span aria-hidden="true">↺</span>
                </button>
                <Link href={file.href} className="inline-flex min-h-10 items-center gap-2 text-sm text-fg-muted hover:text-fg hover:underline">
                  {t("viewAlbum")} <span aria-hidden="true">↗</span>
                </Link>
              </div>
            </div>
            <div className="flex gap-6 sm:hidden">
              <button type="button" onClick={() => engineRef.current?.resetView()} className="min-h-11 text-sm">{t("resetView")}</button>
              <Link href={file.href} className="inline-flex min-h-11 items-center text-sm text-fg-muted">{t("viewAlbum")} ↗</Link>
            </div>
          </div>
        </main>
      )}

      {status === "unsupported" && (
        <div className="absolute inset-0 overflow-y-auto bg-page px-4 pb-10 pt-32 sm:px-8">
          <div className="mx-auto max-w-4xl">
            <h2 className="text-xl font-bold">{t("unsupportedTitle")}</h2>
            <p className="mt-1 text-sm text-fg-muted">{t("unsupportedHint")}</p>
            <ul className="mt-6 divide-y divide-border border-y border-border">
              {files.map((f) => (
                <li key={f.id}>
                  <Link href={f.href} className="flex min-h-12 items-center gap-4 py-3 hover:bg-fg/5">
                    <span className="font-meta w-16 text-xs">{fileCode(f.number)}</span>
                    <span className="flex-1 font-medium">{f.title}</span>
                    <span className="text-sm text-fg-subtle">{columns[f.column]?.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <ArchiveIndex
        open={indexOpen}
        onClose={() => setIndexOpen(false)}
        files={files}
        columns={columns}
        onSelect={(index) => {
          setIndexOpen(false);
          setSelected(index);
        }}
        onOpen={(index) => {
          setIndexOpen(false);
          if (status === "ready") openStudy(index);
          else setSelected(index);
        }}
      />
    </div>
  );
}
