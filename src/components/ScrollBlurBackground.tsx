"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { SITE_BACKGROUND_SCRIM_OPACITY } from "@/lib/themeColor";

// Matches the content pane's backdrop-blur-xl (see SiteChrome), so
// the background eventually looks exactly as soft as what you see through
// the glass panels.
const MAX_BLUR_PX = 24;
// Scroll distance over which the blur ramps from 0 to MAX_BLUR_PX.
const SCROLL_RANGE_PX = 500;

/**
 * A fixed, full-viewport background layer whose blur increases with scroll
 * position. Kept as its own element (rather than blurring the page directly)
 * so the filter never touches the header/main/footer content sitting on top
 * of it.
 */
export default function ScrollBlurBackground({
  style
}: {
  style: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let ticking = false;

    function apply() {
      ticking = false;
      const el = ref.current;
      if (!el) return;
      const t = Math.min(1, Math.max(0, window.scrollY / SCROLL_RANGE_PX));
      el.style.filter = `blur(${(t * MAX_BLUR_PX).toFixed(1)}px)`;
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(apply);
    }

    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <div
        ref={ref}
        aria-hidden
        className="pointer-events-none fixed -inset-16 z-0 transition-[filter] duration-100 ease-out"
        style={{ backgroundColor: "var(--color-page)", ...style }}
      />
      {/* Theme-aware scrim: tints the admin's background image/color with
          the theme's own base color, so it darkens in dark mode and washes
          lighter in light mode instead of staying fixed regardless of theme. */}
      <div
        aria-hidden
        className="pointer-events-none fixed -inset-16 z-0 transition-colors"
        style={{
          backgroundColor: `color-mix(in srgb, var(--color-page) ${SITE_BACKGROUND_SCRIM_OPACITY * 100}%, transparent)`
        }}
      />
    </>
  );
}
