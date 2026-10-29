/**
 * Whether motion run from script should be skipped: the new site's Motion
 * setting once it has written it to <html data-motion>, otherwise the
 * device's own (the same rule as the motion variants in globals.css).
 */
export function lessMotion(): boolean {
  const chosen = document.documentElement.dataset.motion;
  if (chosen) return chosen === "reduced";
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Applies a theme change as one cross-fade of the whole page where the
 * browser can (a view transition, two snapshots blended on the compositor),
 * rather than a colour transition on every element. Without it, or with
 * less motion, the colours change at once.
 */
export function crossFade(change: () => void): void {
  if (typeof document.startViewTransition !== "function" || lessMotion()) {
    change();
    return;
  }
  document.startViewTransition(change);
}
