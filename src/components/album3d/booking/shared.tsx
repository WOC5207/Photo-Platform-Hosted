"use client";

import { useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { StageContext, type Stage } from "../StageContext";
import type { Board } from "../board";
import type { Deck } from "../deck";
import type { PosterStage } from "../poster";
import type { Reel } from "../reel";
import type { Rack } from "../rack";
import type { StageDrag, StageInput } from "../engine";
import { GameMenu } from "../hud";
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

/** The left-hand (bottom, on phones) panel the booking screens draw in. */
export function BookingPanel({ expanded = false, children }: { expanded?: boolean; children: ReactNode }) {
  return (
    <main id="main-content" tabIndex={-1} className={`${styles.panel} outline-none`} data-expanded={expanded}>
      {children}
    </main>
  );
}

/**
 * Previous and next for a panel that shows one item of the stage at a time.
 * On phones the expanded panel covers the stage, so taps and swipes can't
 * reach the other items there; these can.
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
export function NotFoundPanel() {
  const t = useTranslations("album3d");
  const { go } = useStage();
  return (
    <BookingPanel>
      <p className={metaLabel}>{t("archiveLabel")}</p>
      <h1 className="mt-3 text-4xl font-extrabold uppercase tracking-[-0.03em] wide:text-6xl">{t("notFoundTitle")}</h1>
      <p className="mt-3 max-w-md text-sm text-fg-muted">{t("bookingNotFoundHint")}</p>
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
