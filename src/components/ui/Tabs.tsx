"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { lessMotion } from "@/lib/motion";

type Place = { x: number; y: number; width: number };

/**
 * Where each tab bar's underline last sat, by the bar's label. Most tabs
 * are pages of their own, so the next tab's page brings a new bar; its
 * underline glides on from the last one's place.
 */
const lastPlace = new Map<string, Place>();

export interface TabItem {
  id: string;
  label: string;
  href: string;
}

export default function Tabs({
  items,
  active,
  label,
  reloadDocument = false
}: {
  items: TabItem[];
  active: string;
  label: string;
  reloadDocument?: boolean;
}) {
  const navRef = useRef<HTMLElement>(null);
  const lineRef = useRef<HTMLSpanElement>(null);
  // The selected tab draws its own underline until the gliding one is placed
  // (the server's HTML, and before hydration).
  const [placed, setPlaced] = useState(false);

  // One underline glides to the selected tab in 180 ms, easing out, as
  // RhineLabUI's tab underline does. It moves by transform only.
  useLayoutEffect(() => {
    const nav = navRef.current;
    const line = lineRef.current;
    if (!nav || !line) return;
    const place = (glide: boolean) => {
      const tab = nav.querySelector<HTMLElement>('[aria-current="page"]');
      if (!tab) {
        line.style.opacity = "0";
        return;
      }
      // The same inset and edge as the tab's own underline (inset-x-3, bottom -1px).
      const next = { x: tab.offsetLeft + 12, y: tab.offsetTop + tab.offsetHeight - 1, width: Math.max(tab.offsetWidth - 24, 1) };
      const from = lastPlace.get(label);
      lastPlace.set(label, next);
      line.style.opacity = "1";
      line.style.width = `${next.width}px`;
      line.style.transform = `translate(${next.x}px, ${next.y}px)`;
      if (!glide || !from || (from.x === next.x && from.y === next.y && from.width === next.width) || lessMotion()) return;
      line.animate(
        [
          { transform: `translate(${from.x}px, ${from.y}px) scaleX(${from.width / next.width})` },
          { transform: `translate(${next.x}px, ${next.y}px)` }
        ],
        { duration: 180, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
      );
    };
    place(true);
    setPlaced(true);
    // A bar that wraps or scrolls differently at a new width moves at once.
    const observer = new ResizeObserver(() => place(false));
    observer.observe(nav);
    return () => observer.disconnect();
  }, [active, label]);

  return (
    <nav
      ref={navRef}
      aria-label={label}
      className="relative flex flex-wrap gap-1 overflow-y-hidden border-b border-border sm:flex-nowrap sm:overflow-x-auto"
    >
      <span
        ref={lineRef}
        aria-hidden="true"
        className={`pointer-events-none absolute left-0 top-0 h-0.5 origin-left bg-accent ${placed ? "" : "hidden"}`}
      />
      {items.map((item) => {
        const selected = item.id === active;
        return (
          <Link
            key={item.id}
            href={item.href}
            scroll={false}
            onClick={reloadDocument ? (event) => {
              if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              window.location.assign(event.currentTarget.href);
            } : undefined}
            aria-current={selected ? "page" : undefined}
            data-tour={`tab-${item.id}`}
            className={`relative inline-flex min-h-11 shrink-0 items-center px-3 py-2 text-sm font-semibold transition-[color,background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
              selected
                ? `text-fg ${placed ? "" : "after:absolute after:inset-x-3 after:bottom-[-1px] after:h-0.5 after:bg-accent"}`
                : "text-fg-subtle hover:bg-accent-surface hover:text-fg"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
