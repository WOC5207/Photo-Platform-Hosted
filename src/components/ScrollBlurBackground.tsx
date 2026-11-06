"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { SITE_BACKGROUND_SCRIM_OPACITY } from "@/lib/themeColor";

// Matches the content pane's backdrop-blur-xl (see SiteChrome), so
// the background eventually looks exactly as soft as what you see through
// the glass panels.
const MAX_BLUR_PX = 24;
// Scroll distance over which the background goes from sharp to fully blurred.
const SCROLL_RANGE_PX = 500;

/**
 * A fixed, full-viewport background layer that softens as the page scrolls.
 * Kept as its own element (rather than blurring the page directly) so the
 * filter never touches the header/main/footer content sitting on top of it.
 *
 * The blurred copy is drawn once, at the full radius, inside a layer of its
 * own, and scrolling only fades that layer in: changing the blur radius on
 * every scroll frame re-blurred the whole screen each frame, on the main
 * thread. A plain colour background has nothing to blur, so it gets no copy.
 */
export default function ScrollBlurBackground({
  style
}: {
  style: CSSProperties;
}) {
  const blurredRef = useRef<HTMLDivElement>(null);
  const hasImage = Boolean(style.backgroundImage);

  useEffect(() => {
    const el = blurredRef.current;
    if (!el) return;
    let frame = 0;

    const apply = () => {
      frame = 0;
      const t = Math.min(1, Math.max(0, window.scrollY / SCROLL_RANGE_PX));
      el.style.opacity = t.toFixed(3);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };

    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, [hasImage]);

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed -inset-16 z-0"
        style={{ backgroundColor: "var(--color-page)", ...style }}
      />
      {hasImage && (
        // The layer fades; the blur inside it is painted once and kept.
        <div
          ref={blurredRef}
          aria-hidden
          className="pointer-events-none fixed -inset-16 z-0 opacity-0 will-change-[opacity]"
        >
          <div
            className="absolute inset-0"
            style={{ ...style, filter: `blur(${MAX_BLUR_PX}px)` }}
          />
        </div>
      )}
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
