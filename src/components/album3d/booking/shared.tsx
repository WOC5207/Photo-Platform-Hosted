"use client";

import { useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { reportSheet } from "../types";
import { useTranslations } from "next-intl";
import { StageContext, type Stage } from "../StageContext";
import type { Board } from "../board";
import type { Deck } from "../deck";
import type { PosterStage } from "../poster";
import type { Reel } from "../reel";
import type { Rack } from "../rack";
import type { StageDrag, StageInput } from "../engine";
import { GameMenu } from "../hud";
import { lessMotion } from "@/lib/motion";
import styles from "./Booking.module.css";

/** Pieces shared by the 3D site's booking board, schedule and prize draw screens. */

export const metaLabel = "font-meta text-[0.625rem] uppercase tracking-[0.16em] text-fg-subtle";
export const fieldClass =
  "min-h-11 w-full border border-border-strong bg-page/80 px-3 py-2 text-sm text-fg outline-none transition placeholder:text-fg-faint focus:border-fg focus-visible:ring-2 focus-visible:ring-accent/30";
export const primaryClass =
  "inline-flex min-h-12 items-center justify-between gap-4 bg-fg px-5 text-sm font-semibold uppercase tracking-[0.08em] text-page transition hover:bg-accent-text disabled:opacity-40";
export const secondaryClass =
  "inline-flex min-h-11 items-center gap-3 border border-border-strong px-4 text-sm uppercase tracking-[0.06em] transition hover:border-fg disabled:opacity-40";

const fallbackStage: Stage = {
  engine: null,
  go: () => undefined,
  path: () => "/3d",
  back: () => undefined,
  key: (name) => ({ move: "↑ ↓", confirm: "ENTER", back: "ESC", sides: "← →", alt: "/" })[name],
  touch: false
};

export function useStage(): Stage {
  return useContext(StageContext) ?? fallbackStage;
}

type Scenes = { board: Board; deck: Deck; poster: PosterStage; case: PosterStage; reel: Reel; rack: Rack };

/**
 * The booking board, the prize deck, the poster easel, the events reel or the gear rack,
 * once the scene has it on screen. "case" is the easel's stage with the camera case in place of
 * the easel, for the equipment screens.
 */
export function useScene<K extends keyof Scenes>(kind: K): Scenes[K] | null {
  const { engine } = useStage();
  const [scene, setScene] = useState<Scenes[keyof Scenes] | null>(null);
  useEffect(() => {
    if (!engine) return;
    let live = true;
    let prop: PosterStage | null = null;
    (kind === "board" ? engine.showBoard() : kind === "deck" ? engine.showDeck() : kind === "reel" ? engine.showReel() : kind === "rack" ? engine.showRack() : engine.showPoster()).then((next) => {
      if (!live) return;
      if (kind === "case" && next) {
        prop = next as PosterStage;
        prop.setProp("case");
      }
      setScene(next);
    });
    return () => {
      live = false;
      prop?.setProp("easel");
      setScene(null);
    };
  }, [engine, kind]);
  return scene as Scenes[K] | null;
}

/** Taps, swipes and the wheel on the scene, for as long as the screen is up. */
export function useStageInput(handler: (input: StageInput) => void) {
  const { engine } = useStage();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!engine) return;
    engine.setStageHandler((input) => ref.current(input));
    return () => engine.setStageHandler(null);
  }, [engine]);
}

/** Raw pointers and the wheel on the scene, ahead of its taps and swipes (see StageDrag). */
export function useStageDrag(handler: (input: StageDrag) => boolean) {
  const { engine } = useStage();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!engine) return;
    engine.setStageDrag((input) => ref.current(input));
    return () => engine.setStageDrag(null);
  }, [engine]);
}

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

/**
 * Keys for the screen, ahead of the 3D site's own handler (which still takes
 * Esc unless this one used it). Return true when the key was used.
 */
export function useScreenKeys(handler: (key: string, target: EventTarget | null, event: KeyboardEvent) => boolean) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (document.querySelector("[role=dialog]")) return;
      if (ref.current(e.key, e.target, e)) e.preventDefault();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
}

export function isInteractive(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest("a, button, input, select, textarea, summary"));
}

/**
 * The photographer's Expand or Collapse on a phone's Dashboard sheet, kept
 * for the visit so the next screen opens the same way: "up" (the sheet
 * raised over the scene), "down", or null before they choose.
 */
type SheetChoice = "up" | "down" | null;
const SHEET_KEY = "album3d-sheet";
let sheetChoice: SheetChoice | undefined;
const sheetListeners = new Set<() => void>();

function readSheetChoice(): SheetChoice {
  if (sheetChoice === undefined) {
    try {
      const saved = sessionStorage.getItem(SHEET_KEY);
      sheetChoice = saved === "up" || saved === "down" ? saved : null;
    } catch {
      sheetChoice = null;
    }
  }
  return sheetChoice;
}

export function setSheetChoice(next: "up" | "down") {
  sheetChoice = next;
  try {
    sessionStorage.setItem(SHEET_KEY, next);
  } catch {
    // The choice still holds until the page reloads.
  }
  sheetListeners.forEach((listener) => listener());
}

export function useSheetChoice(): SheetChoice {
  return useSyncExternalStore(
    (listener) => {
      sheetListeners.add(listener);
      return () => sheetListeners.delete(listener);
    },
    readSheetChoice,
    () => null
  );
}

/** The phone sheet's Expand / Collapse button (hidden on wider screens, see .raise). */
export function SheetToggle({ up, onToggle, downLabel }: { up: boolean; onToggle: () => void; downLabel?: string }) {
  const t = useTranslations("album3d");
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={up}
      className={`${styles.raise} font-meta sticky top-0 z-10 -mb-11 ml-auto flex min-h-11 items-center gap-2 border border-border-strong bg-page/85 px-3 text-[0.625rem] uppercase tracking-[0.12em] text-fg-muted transition hover:border-fg hover:text-fg`}
    >
      {up ? (downLabel ?? t("studioSheetLower")) : t("studioSheetExpand")}
      <span aria-hidden="true" className="text-sm leading-none">{up ? "↓" : "↑"}</span>
    </button>
  );
}

/**
 * The left-hand (bottom, on phones) panel the booking screens draw in. On
 * phones an expanded panel is a taller sheet that still leaves the scene a
 * strip above it; "cover" takes the whole screen below the header, for a
 * step that needs it (a review form, typing); "full" fills the screen below
 * the header whatever its content, for a menu that is read through rather
 * than looked past, with the scene left framed as it is behind it. The sheet
 * reports where it starts, so the scene frames itself above it.
 */
export function BookingPanel({
  expanded = false,
  view,
  raised = false,
  work = false,
  children
}: {
  expanded?: boolean | "cover" | "full" | "work";
  /**
   * On phones a full sheet can open on a window onto the scene, holding this,
   * which scrolls away as the sheet goes up (see .window). Wider screens have
   * the scene beside the panel already, so they leave it out.
   */
  view?: ReactNode;
  /** The window closed: the sheet takes the whole screen, and the scene shows through it (see .panel[data-raised]). */
  raised?: boolean;
  /**
   * A Dashboard work screen (a list to get through, not a scene to look at):
   * on phones it opens expanded, leaving the scene a slim strip under the
   * header, until the photographer collapses it to `expanded`'s sheet. Their
   * choice holds across screens for the visit (see useSheetChoice).
   */
  work?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const choice = useSheetChoice();
  const workUp = work && choice !== "down";
  const collapsedCap = expanded === true ? 0.52 : 0.46;
  if (workUp) expanded = "work";
  const full = expanded === "full";
  // A work screen short enough to fit its collapsed sheet (46dvh, or 52dvh
  // expanded; see Booking.module.css) has nothing to expand, so no button.
  const [fits, setFits] = useState(false);
  useEffect(() => {
    const main = ref.current;
    if (!main || !work) return;
    const check = () => setFits(main.scrollHeight <= window.innerHeight * collapsedCap);
    const observer = new ResizeObserver(check);
    observer.observe(main);
    check();
    return () => observer.disconnect();
  }, [work, collapsedCap]);
  useEffect(() => {
    const main = ref.current;
    // A full sheet, or a page over the backdrop, leaves the scene framed as it is.
    if (!main || full || main.closest("[data-backdrop]")) return;
    const owner = {};
    const report = () => reportSheet(owner, main.offsetTop);
    const observer = new ResizeObserver(report);
    observer.observe(main);
    report();
    return () => {
      observer.disconnect();
      reportSheet(owner, null);
    };
  }, [full]);
  // Raising or lowering the sheet moves its content at once (the window
  // gives up or takes back its room); the content then slides from where it
  // was on screen with a transform only, beside the sheet's colour (see
  // .panel[data-window]::before), RhineLabUI's 300 ms easing out.
  const body = useRef<HTMLDivElement>(null);
  const bodyTop = useRef<number | null>(null);
  const windowed = view !== undefined && view !== null;
  useLayoutEffect(() => {
    const sheet = body.current;
    const was = bodyTop.current;
    bodyTop.current = sheet?.offsetTop ?? null;
    if (!sheet || was === null || was === sheet.offsetTop || lessMotion()) return;
    // A slide still under way starts the next one from where it has got to.
    const sliding = new DOMMatrix(getComputedStyle(sheet).transform).m42;
    sheet.getAnimations().forEach((animation) => animation.cancel());
    sheet.animate([{ transform: `translateY(${was + sliding - sheet.offsetTop}px)` }, { transform: "none" }], {
      duration: 300,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)"
    });
  }, [raised, windowed]);
  return (
    <main ref={ref} id="main-content" tabIndex={-1} className={`${styles.panel} outline-none`} data-expanded={expanded} data-window={view ? "" : undefined} data-raised={view && raised ? "" : undefined}>
      {view ? (
        <>
          <div className={styles.window} inert={raised}>
            {view}
          </div>
          <div ref={body} className={styles.sheetBody}>
            {children}
          </div>
        </>
      ) : (
        <>
          {work && !fits && <SheetToggle up={workUp} onToggle={() => setSheetChoice(workUp ? "down" : "up")} />}
          {children}
        </>
      )}
    </main>
  );
}

/**
 * Previous and next for a panel that shows one item of the stage at a time.
 * On phones the stage is a narrow strip above the sheet, too small to tap
 * through the other items reliably; these step through them.
 */
export function StepButtons({ onStep, atStart, atEnd }: { onStep: (delta: -1 | 1) => void; atStart: boolean; atEnd: boolean }) {
  const t = useTranslations("album3d");
  const step = "grid h-11 w-11 shrink-0 place-items-center text-xl transition hover:bg-accent-surface disabled:opacity-30";
  return (
    <span className="flex shrink-0">
      <button type="button" onClick={() => onStep(-1)} disabled={atStart} aria-label={t("creatorPrevious")} className={step}>
        ←
      </button>
      <button type="button" onClick={() => onStep(1)} disabled={atEnd} aria-label={t("creatorNext")} className={step}>
        →
      </button>
    </span>
  );
}

/** The column and row `delta` items on from this one, reading lane by lane; null past either end. */
export function stepLanes(lengths: number[], column: number, row: number, delta: number): [number, number] | null {
  let flat = row + lengths.slice(0, column).reduce((n, len) => n + len, 0) + delta;
  if (flat < 0) return null;
  for (let c = 0; c < lengths.length; c++) {
    if (flat < lengths[c]) return [c, flat];
    flat -= lengths[c];
  }
  return null;
}

/** An unknown photographer, event or draw, or one that is no longer open. */
export function NotFoundPanel({ hint }: { hint?: string }) {
  const t = useTranslations("album3d");
  const { go } = useStage();
  return (
    <BookingPanel>
      <p className={metaLabel}>{t("archiveLabel")}</p>
      <h1 className="mt-3 text-4xl font-extrabold uppercase tracking-[-0.03em] wide:text-6xl">{t("notFoundTitle")}</h1>
      <p className="mt-3 max-w-md text-sm text-fg-muted">{hint ?? t("bookingNotFoundHint")}</p>
      <GameMenu
        label={t("notFoundTitle")}
        className="mt-8"
        focus={0}
        onFocus={() => undefined}
        items={[{ key: "menu", label: t("notFoundBack"), run: () => go({ kind: "title" }) }]}
      />
    </BookingPanel>
  );
}

/** Times on these screens are the event's local time, as on the classic pages. */
export function LocalTimeNote() {
  const t = useTranslations("booking");
  return (
    <p role="note" className="mt-4 border-l-2 border-accent pl-3 text-xs leading-5 text-fg-muted">
      <span className="font-meta mr-2 text-[0.625rem] font-semibold tracking-[0.14em] text-fg">{t("eventLocalTimeMarker")}</span>
      {t("eventLocalTimeNotice")}
    </p>
  );
}
