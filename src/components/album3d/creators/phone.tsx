"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useVisualViewport } from "@/components/cosplan/useVisualViewport";

/**
 * The poster creators on a phone held upright: the poster flat and as wide
 * as the screen instead of on the easel, a bar of tools under it from the
 * start, and each tool's controls in a sheet between the two. The Cosplan
 * board and every Sharepost step use these pieces.
 *
 * They move as RhineLabUI's surfaces do (https://github.com/LBEILC/RhineLabUI,
 * MIT; the classes are in globals.css): sheets and strips rise in, the
 * poster eases to its new size and place when a sheet takes or gives back
 * room, and the tool bar's marker glides. Nothing waits for a motion to
 * end, so taps land at once.
 */

/** RhineLabUI's easing out, for what arrives or settles. */
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

/** The class name for a surface that rises in (300 ms, fading in over 12 px). */
export const ENTER = "phone-rise";

/**
 * Whether this device, or the site's own Motion setting, asks for less
 * motion. The classes' stylesheet checks both itself; motion run from
 * script asks here.
 */
function motionOff() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.querySelector('[data-motion="reduced"]') !== null;
}

/** Any CSS colour as rgb(), which the guides' alpha needs. */
export function cssColor(element: HTMLElement, name: string, fallback: string) {
  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!ctx) return fallback;
  ctx.fillStyle = fallback;
  ctx.fillStyle = getComputedStyle(element).getPropertyValue(name).trim() || fallback;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `rgb(${r}, ${g}, ${b})`;
}

/** The whole visible screen, above the 3D site's header; it shrinks with the on-screen keyboard. */
export function PhoneShell({ rootRef, children }: { rootRef?: RefObject<HTMLElement | null>; children: ReactNode }) {
  const viewport = useVisualViewport();
  return (
    <main
      ref={rootRef}
      id="main-content"
      tabIndex={-1}
      className="fixed z-40 flex flex-col overflow-hidden bg-page text-fg outline-none"
      style={{ left: viewport.left, top: viewport.top, width: viewport.width, height: viewport.height }}
    >
      {children}
    </main>
  );
}

/** The top bar's way out, with an arrow and the place it leads. */
export function PhoneBack({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex min-h-11 shrink-0 items-center gap-1 px-2 text-sm font-semibold">
      <span aria-hidden="true" className="text-xl leading-none">‹</span>
      {label}
    </button>
  );
}

/** The poster's size in CSS pixels: as large as `frame` allows at this width-to-height ratio. */
export function usePosterFit(frameRef: RefObject<HTMLElement | null>, ratio: number) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame || !ratio) return;
    const fit = () => {
      const width = Math.max(0, frame.clientWidth - 16);
      const height = Math.max(0, frame.clientHeight - 16);
      setSize(width / height > ratio ? { width: height * ratio, height } : { width, height: width / ratio });
    };
    const observer = new ResizeObserver(fit);
    observer.observe(frame);
    fit();
    return () => observer.disconnect();
  }, [frameRef, ratio]);
  return size;
}

/**
 * The poster eases from its old size and place to its new ones (300 ms)
 * when a sheet opens, closes or changes height, the keyboard comes up, or
 * its shape changes, so it never jumps. Only a transform moves, over the
 * poster already drawn at its new size; a change during the motion carries
 * on from where the poster is.
 */
export function usePosterMorph(posterRef: RefObject<HTMLElement | null>, size: { width: number; height: number }) {
  const last = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const settle = useCallback(() => {
    const poster = posterRef.current;
    if (!poster || !poster.offsetWidth) return;
    const now = { x: poster.offsetLeft + poster.offsetWidth / 2, y: poster.offsetTop + poster.offsetHeight / 2, width: poster.offsetWidth, height: poster.offsetHeight };
    const was = last.current;
    last.current = now;
    if (!was || (was.x === now.x && was.y === now.y && was.width === now.width && was.height === now.height) || motionOff()) return;
    // Where the poster shows right now, part way through an earlier move.
    let from = was;
    const running = poster.getAnimations();
    if (running.length) {
      const transform = getComputedStyle(poster).transform;
      const m = new DOMMatrixReadOnly(transform === "none" ? undefined : transform);
      from = { x: was.x + m.e, y: was.y + m.f, width: was.width * m.a, height: was.height * m.d };
      running.forEach((animation) => animation.cancel());
    }
    poster.animate(
      [{ transform: `translate(${from.x - now.x}px, ${from.y - now.y}px) scale(${from.width / now.width}, ${from.height / now.height})` }, { transform: "none" }],
      { duration: 300, easing: EASE_OUT }
    );
  }, [posterRef]);
  // The poster's own size changes, and its frame's (which moves it without resizing it).
  useLayoutEffect(settle, [settle, size.width, size.height]);
  const shown = size.width > 0;
  useLayoutEffect(() => {
    const frame = posterRef.current?.parentElement;
    if (!frame || !shown) return;
    const observer = new ResizeObserver(settle);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [posterRef, settle, shown]);
}

/**
 * A strip's items (each marked with `data-motion-key`) glide to their new
 * places when they are reordered, and new ones rise in.
 */
export function useStripMotion(stripRef: RefObject<HTMLElement | null>, keys: string, shown: boolean) {
  const places = useRef<Map<string, number> | null>(null);
  useLayoutEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const items = [...strip.querySelectorAll<HTMLElement>("[data-motion-key]")];
    const now = new Map(items.map((item) => [item.dataset.motionKey ?? "", item.offsetLeft]));
    const was = places.current;
    places.current = now;
    if (!was || motionOff()) return;
    for (const item of items) {
      const from = was.get(item.dataset.motionKey ?? "");
      if (from === undefined) item.animate([{ opacity: 0, translate: "0 12px" }, { opacity: 1, translate: "0 0" }], { duration: 300, easing: EASE_OUT });
      else if (from !== item.offsetLeft) item.animate([{ translate: `${from - item.offsetLeft}px 0` }, { translate: "0 0" }], { duration: 300, easing: EASE_OUT });
    }
  }, [stripRef, keys, shown]);
}

/** A canvas sized for the screen's density, `width` × `height` CSS pixels; true when its pixels changed. */
export function fitCanvas(canvas: HTMLCanvasElement, width: number, height: number) {
  const density = Math.min(window.devicePixelRatio || 1, 3);
  const w = Math.max(1, Math.round(width * density));
  const h = Math.max(1, Math.round(height * density));
  if (canvas.width === w && canvas.height === h) return false;
  canvas.width = w;
  canvas.height = h;
  return true;
}

export function PhoneIcon({ d }: { d: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

/** Icon paths for the tools, drawn on a 24 px grid. */
export const ICONS = {
  find: "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM15.5 15.5 20 20",
  upload: "M12 16V4M7 9l5-5 5 5M4 15v4h16v-4",
  arrange: "M12 3v18M3 12h18M12 3 9.5 5.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5",
  text: "M5 6V4h14v2M12 4v16M9 20h6",
  layers: "m12 4 8 4-8 4-8-4 8-4ZM4 12l8 4 8-4M4 16l8 4 8-4",
  delete: "M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13M10 11v6M14 11v6",
  undo: "M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3",
  redo: "m15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3",
  photos: "M4 6h16v13H4ZM4 15l4.5-4.5L13 15l2.5-2.5L20 17M15 10.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z",
  layout: "M4 4h16v16H4ZM4 12h16M12 4v8",
  style: "M12 21a9 9 0 1 1 9-9c0 2-1.5 3-3.5 3H15a2 2 0 0 0-1.5 3.3A1.6 1.6 0 0 1 12 21ZM7.5 11.5h.01M10.5 7.5h.01M15 7.5h.01",
  credits: "M4 7h16M4 12h10M4 17h13"
} as const;

export interface PhoneTool {
  key: string;
  label: string;
  icon: keyof typeof ICONS;
  /** Its sheet is open; undefined for a tool that only acts. */
  active?: boolean;
  disabled?: boolean;
  run: () => void;
}

/**
 * The bar of tools at the foot of the screen, always there. The open tool
 * is marked by one block that glides from tool to tool (180 ms).
 */
export function PhoneToolbar({ label, tools, hidden, onUse }: { label: string; tools: PhoneTool[]; hidden?: boolean; onUse?: () => void }) {
  const at = tools.findIndex((tool) => tool.active);
  // Where the marker last stood, so it fades out there and glides only between two open tools.
  const last = useRef({ at: -1, place: Math.max(0, at) });
  const place = at >= 0 ? at : last.current.place;
  const glide = at >= 0 && last.current.at >= 0;
  useEffect(() => {
    last.current = { at, place };
  });
  return (
    <nav
      aria-label={label}
      hidden={hidden}
      className="relative grid shrink-0 border-t border-border-strong bg-page pb-[env(safe-area-inset-bottom)]"
      style={{ gridTemplateColumns: `repeat(${tools.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden="true"
        className="phone-marker pointer-events-none absolute left-0 top-0 bottom-[env(safe-area-inset-bottom)] bg-fg"
        style={{ width: `${100 / tools.length}%`, translate: `${place * 100}% 0`, opacity: at >= 0 ? 1 : 0, transitionProperty: glide ? undefined : "opacity" }}
      />
      {tools.map((tool) => (
        <button
          key={tool.key}
          type="button"
          aria-pressed={tool.active === undefined ? undefined : tool.active}
          disabled={tool.disabled}
          onClick={() => {
            onUse?.();
            tool.run();
          }}
          className={`relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 px-0.5 text-[0.6875rem] font-semibold leading-tight transition-[color,opacity] duration-[180ms] disabled:opacity-30 ${tool.active ? "text-page" : "text-fg"}`}
        >
          <PhoneIcon d={ICONS[tool.icon]} />
          <span className="w-full truncate text-center">{tool.label}</span>
        </button>
      ))}
    </nav>
  );
}

/**
 * A tool's controls between the poster and the bar, scrolling inside
 * themselves. `tall` gives them most of the screen, for typing. It rises in
 * when it mounts, so give each tool's sheet its own key.
 */
export function PhoneSheet({ title, aside, doneLabel, onDone, tall = false, children }: { title: string; aside?: ReactNode; doneLabel: string; onDone: () => void; tall?: boolean; children: ReactNode }) {
  return (
    <section aria-label={title} className={`phone-rise flex shrink-0 flex-col border-t border-border-strong ${tall ? "max-h-[72%]" : "max-h-[46%]"}`}>
      <div className="flex shrink-0 items-center gap-2 px-3 pt-1">
        <h2 className="min-w-0 flex-1 truncate text-base font-extrabold uppercase tracking-[-0.02em]">
          {title}
          {aside && <span className="ml-2 text-sm font-semibold normal-case tracking-normal text-fg-muted">{aside}</span>}
        </h2>
        <button type="button" onClick={onDone} className="min-h-11 px-2 text-sm font-semibold uppercase tracking-[0.06em]">{doneLabel}</button>
      </div>
      <div className="phone-rise-late min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">{children}</div>
    </section>
  );
}
