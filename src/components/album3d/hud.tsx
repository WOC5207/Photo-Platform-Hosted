"use client";

import type { ReactNode } from "react";
import type { Screen } from "@/lib/siteMode";
import styles from "./ArchiveSite.module.css";

/** HUD pieces shared by the 3D site's screens. */

export const pad = (n: number, width = 2) => String(n).padStart(width, "0");
export const wrap = (value: number, count: number) => ((value % count) + count) % count;
/** Screens drawn as a menu over the scene. */
export const MENU_SCREENS: Screen["kind"][] = ["title", "settings", "login", "photographers", "photographer"];

/** Digits that roll in when they change, as the reference's counters do. */
export function Rolling({ value }: { value: string }) {
  return (
    <span aria-hidden="true" className="tabular-nums">
      {value.split("").map((ch, i) => (
        <span key={`${i}-${ch}`} className={/\d/.test(ch) ? styles.digit : undefined}>
          {ch}
        </span>
      ))}
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
  return (
    <ol aria-label={label} className={`grid grid-cols-[minmax(0,1fr)] gap-1 ${className}`}>
      {items.map((item, i) => {
        const active = i === focus;
        return (
          <li key={item.key} className="relative min-w-0" onMouseEnter={() => onFocus(i)}>
            <span
              aria-hidden="true"
              className={`absolute left-0 top-1/2 h-9 w-[3px] -translate-y-1/2 bg-fg transition-opacity duration-200 ${active ? "opacity-100" : "opacity-0"}`}
            />
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
                <span className="block truncate text-lg font-bold uppercase tracking-[0.02em] wide:text-[1.625rem]">{item.label}</span>
                {item.sub && (
                  <span className="font-meta mt-0.5 block truncate text-[0.625rem] uppercase tracking-[0.14em] text-fg-subtle">{item.sub}</span>
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
