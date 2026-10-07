"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Screen } from "@/lib/siteMode";
import styles from "./ArchiveSite.module.css";

/** HUD pieces shared by the 3D site's screens. */

export const pad = (n: number, width = 2) => String(n).padStart(width, "0");
export const wrap = (value: number, count: number) => ((value % count) + count) % count;
/** Screens drawn as a menu over the scene. */
export const MENU_SCREENS: Screen["kind"][] = ["title", "settings", "login", "photographers", "photographer"];

/**
 * A value that rolls when it changes: the old one leaves upward as the new
 * one arrives (460 ms), as RhineLabUI's counters and titles do. The first
 * value shows as is. `layer` styles both the old and the new text.
 */
export function Roll({ value, className = "", layer = "" }: { value: string; className?: string; layer?: string }) {
  const [state, setState] = useState({ now: value, was: "", turn: 0 });
  const shown = state.now === value ? state : { now: value, was: state.now, turn: state.turn + 1 };
  if (shown !== state) setState(shown);
  return (
    <span className={`${styles.roll} ${className}`}>
      {shown.turn > 0 && (
        <span key={`was-${shown.turn}`} aria-hidden="true" className={`${styles.rollOut} ${layer}`}>
          {shown.was}
        </span>
      )}
      <span key={`now-${shown.turn}`} className={`${shown.turn > 0 ? styles.rollIn : ""} ${layer}`}>
        {shown.now}
      </span>
    </span>
  );
}

/** Digits that roll when they change, as the reference's counters do. */
export function Rolling({ value }: { value: string }) {
  return (
    <span aria-hidden="true" className="tabular-nums">
      {value.split("").map((ch, i) =>
        /\d/.test(ch) ? <Roll key={i} value={ch} className={styles.digit} /> : <span key={i}>{ch}</span>
      )}
    </span>
  );
}

export interface MenuItem {
  key: string;
  label: string;
  sub?: string;
  /** A setting's current value, changed with ← → or Enter. */
  value?: string;
  /** Leaves the 3D site, so it shows an outward arrow. */
  external?: boolean;
  run: () => void;
}

/**
 * A game-style menu: one focused item at a time, moved with the arrow keys
 * (handled by the screen) or the pointer, confirmed with Enter or a click.
 */
export function GameMenu({
  label,
  items,
  focus,
  onFocus,
  className = ""
}: {
  label: string;
  items: MenuItem[];
  focus: number;
  onFocus: (index: number) => void;
  className?: string;
}) {
  // One focus marker glides from item to item (180 ms), like RhineLabUI's
  // tab underline, rather than each item fading its own in and out.
  const list = useRef<HTMLOListElement>(null);
  const [marker, setMarker] = useState<{ y: number; glide: boolean } | null>(null);
  useLayoutEffect(() => {
    const ol = list.current;
    if (!ol) return;
    const place = () => {
      const item = ol.querySelector<HTMLElement>(`[data-menu-item="${focus}"]`)?.parentElement;
      setMarker((was) => (item ? { y: item.offsetTop + item.offsetHeight / 2, glide: was !== null } : null));
    };
    place();
    // Labels wrap differently once fonts load or the screen turns.
    const observer = new ResizeObserver(place);
    observer.observe(ol);
    return () => observer.disconnect();
  }, [focus, items.length]);

  return (
    <ol ref={list} aria-label={label} className={`relative grid grid-cols-[minmax(0,1fr)] gap-1 ${className}`}>
      {marker && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 z-10 h-9 w-[3px] bg-fg transition-transform duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
          style={{ transform: `translateY(${marker.y - 18}px)`, transitionProperty: marker.glide ? undefined : "none" }}
        />
      )}
      {items.map((item, i) => {
        const active = i === focus;
        return (
          <li key={item.key} className="relative min-w-0" onMouseEnter={() => onFocus(i)}>
            <button
              type="button"
              data-menu-item={i}
              aria-current={active ? "true" : undefined}
              onFocus={() => onFocus(i)}
              onClick={item.run}
              className={`flex min-h-14 w-full items-center gap-4 py-2 pr-3 text-left transition-[background-color,color,padding] duration-200 motion-reduce:transition-none ${
                active ? "bg-fg/[0.06] pl-7 text-fg" : "pl-5 text-fg-muted hover:text-fg"
              }`}
            >
              <span aria-hidden="true" className="font-meta w-7 shrink-0 text-[0.6875rem] tracking-[0.14em] text-fg-subtle">
                {pad(i + 1)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-lg font-bold uppercase tracking-[0.02em] wide:text-[1.625rem] max-sm:line-clamp-2 max-sm:whitespace-normal max-sm:leading-tight">{item.label}</span>
                {item.sub && (
                  <span className="font-meta mt-0.5 block truncate text-[0.625rem] uppercase tracking-[0.14em] text-fg-subtle max-sm:line-clamp-2 max-sm:whitespace-normal">{item.sub}</span>
                )}
              </span>
              {item.value !== undefined ? (
                <span className="font-meta flex shrink-0 items-center gap-2 text-xs uppercase tracking-[0.12em]">
                  <span aria-hidden="true" className={active ? "opacity-100" : "opacity-0"}>‹</span>
                  <span className="min-w-[5.5rem] text-center">{item.value}</span>
                  <span aria-hidden="true" className={active ? "opacity-100" : "opacity-0"}>›</span>
                </span>
              ) : (
                <span
                  aria-hidden="true"
                  className={`text-2xl transition duration-200 motion-reduce:transition-none ${active ? "translate-x-0 opacity-100" : "-translate-x-2 opacity-0"}`}
                >
                  {item.external ? "↗" : "→"}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function Hints({ parts, className }: { parts: ReactNode[]; className: string }) {
  return (
    <p className={`${className} font-meta hidden text-[0.625rem] uppercase tracking-[0.08em] text-fg-subtle sm:block`}>
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && <span aria-hidden="true" className="mx-3">／</span>}
          {part}
        </span>
      ))}
    </p>
  );
}
