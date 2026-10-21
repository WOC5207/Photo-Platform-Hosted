/**
 * The phone boards' motion in script, for what CSS can't start: RhineLabUI's
 * (https://github.com/LBEILC/RhineLabUI, MIT) curve and rise, and whether to
 * hold still. Kept apart from phone.tsx so the easel's typing sheet can rise
 * without carrying the phone boards.
 */

/** RhineLabUI's easing out, for what arrives or settles. */
export const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

/**
 * Whether this device, or the site's own Motion setting, asks for less
 * motion. The setting marks the site's root, which a portal sits outside.
 */
export function motionOff() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.querySelector('[data-motion="reduced"]') !== null;
}

/** Rises `element` in (300 ms, fading in over 12 px), as phone.module.css's `.enter` does, for one already on the page. */
export function rise(element: HTMLElement) {
  if (!motionOff()) element.animate([{ opacity: 0, translate: "0 12px" }, { opacity: 1, translate: "0 0" }], { duration: 300, easing: EASE_OUT });
}
