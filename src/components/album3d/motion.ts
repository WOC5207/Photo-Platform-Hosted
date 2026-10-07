/**
 * Archive motion curves.
 *
 * Adapted from RhineLabUI (https://github.com/LBEILC/RhineLabUI, src/motion.ts
 * and src/archive-loop.ts), MIT License, Copyright (c) 2026 LBEILC. The values
 * are the ones that project calibrated against its reference film; only the
 * cinematic opening, which this archive does not play, is left out.
 */

export const smooth = (t: number) => {
  t = Math.max(0, Math.min(1, t));
  return t * t * t * (10 + t * (-15 + 6 * t));
};

const bell = (x: number, width: number) => Math.exp(-0.5 * (x / width) ** 2);

/**
 * The resting "shoulder" around the selected file: a long ridge that peaks at
 * the selection and slopes away row by row, so neighbouring files read as one
 * continuous surface rather than as separate steps.
 */
export function settlingWave(distance: number, time = 26.56) {
  const age = time - 25.05 - Math.abs(distance) * 0.065;
  const envelope = Math.max(-0.42, 2.15 - 0.17 * (Math.sqrt(distance * distance + 1) - 1));
  const rise = smooth(age / 0.62);
  const ring = age > 0 ? Math.sin(age * 5.1) * Math.exp(-age * 1.3) : 0;
  return envelope * (rise + 0.18 * ring * smooth(age / 0.16));
}

/**
 * Rows in front of the selection step down toward the viewer, the nearest
 * steps the deepest, so each card there shows a band of its cover above
 * the next one.
 */
export function stairDrop(distance: number) {
  return distance > 0 ? 4 * (1 - Math.exp(-distance / 4)) : 0;
}

/** The ripple that runs outward from a newly selected file. */
export function selectionWave(distance: number, age: number) {
  if (age < 0 || age > 3.2) return 0;
  return (
    0.8 *
    smooth(age / 0.2) *
    Math.exp(-age * 1.15) *
    Math.cos((distance - age * 8) * 0.58) *
    bell(distance - age * 8, 3.4)
  );
}

/** The selected column stands proud; the others keep a quarter of the ridge. */
export function columnStrength(lane: number, focus: number) {
  return 0.25 + 0.75 * bell(lane - focus, 0.55);
}

/** A quiet idle drift, at most 0.102 units, slightly out of phase per card. */
export function idleWave(row: number, lane: number, time: number) {
  return (
    0.075 * Math.sin((time * Math.PI * 2) / 8 + row * 0.3 - lane * 0.45) +
    0.027 * Math.sin((time * Math.PI * 2) / 13 - row * 0.17 + lane * 0.3)
  );
}

export interface Spring {
  value: number;
  velocity: number;
}

export function spring(value: number): Spring {
  return { value, velocity: 0 };
}

/** Critically damped step that keeps velocity across retargeting. */
export function damp(s: Spring, target: number, rate: number, dt: number) {
  const delta = s.value - target;
  const impulse = s.velocity + rate * delta;
  const decay = Math.exp(-rate * dt);
  s.value = target + (delta + impulse * dt) * decay;
  s.velocity = (s.velocity - rate * impulse * dt) * decay;
}

export function settled(s: Spring, target: number) {
  return Math.abs(s.value - target) < 5e-4 && Math.abs(s.velocity) < 5e-4;
}

export function wrap(value: number, count: number) {
  return ((value % count) + count) % count;
}

/** The occurrence of `value` (repeating every `period`) closest to `center`. */
export function nearestOccurrence(value: number, center: number, period: number) {
  return value + Math.floor((center - value + period / 2) / period) * period;
}

/**
 * A stage that a drag carries along under the finger, as RhineLabUI's archive
 * does (src/archive-drag.ts): the stage follows the finger, and on release it
 * carries on at the finger's speed toward the item it will come to rest on.
 * Positions are in items (rows for a grid), fractional while held.
 */
export interface Follow {
  /** The way a drag moves the stage: "x" brings the next item from the right, "y" the next row from below. Null when it doesn't follow drags now. */
  dragAxis(): "x" | "y" | null;
  /** Screen pixels per item along that axis. */
  pitch(): number;
  /** The item the stage rests on. */
  index(): number;
  /** Stops the stage where it is and returns that position. */
  grab(): number;
  /** Shows the stage at `position` while the finger holds it. */
  hold(position: number): void;
  /**
   * Lets go: the stage moves on at `velocity` items a second and comes to
   * rest on the item nearest `landing`, at least one item along `swipe` when
   * that is a clear swipe (-1 or 1). Returns that item, now the stage's focus.
   */
  release(landing: number, velocity: number, swipe: number): number;
}

/** RhineLabUI's coasting friction: a fling travels its speed / FLING_FRICTION further. */
export const FLING_FRICTION = 2.4;

/** The speed a drag is released at, from its last 100 ms, in units a second. */
export class DragSpeed {
  private samples: { t: number; v: number }[] = [];
  push(t: number, v: number) {
    const last = this.samples[this.samples.length - 1];
    // A reversal starts a fresh estimate.
    if (this.samples.length >= 2) {
      const prev = this.samples[this.samples.length - 2];
      if ((last.v - prev.v) * (v - last.v) < 0) this.samples = [last];
    }
    this.samples.push({ t, v });
    this.samples = this.samples.filter((s) => t - s.t <= 100);
  }
  speed(now: number) {
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    if (!first || !last || now - last.t > 80 || last.t - first.t < 8) return 0;
    return ((last.v - first.v) * 1000) / (last.t - first.t);
  }
  clear() {
    this.samples = [];
  }
}

/** Past either end, a held stage gives a third of the finger's travel, as a page does at its edges. */
export function rubber(position: number, min: number, max: number) {
  if (position < min) return min + (position - min) * 0.35;
  if (position > max) return max + (position - max) * 0.35;
  return position;
}

/** The item a released stage rests on: nearest its landing, one on at least for a clear swipe. */
export function restOn(landing: number, from: number, swipe: number, count: number, loop = false) {
  let index = Math.round(landing);
  const at = (i: number) => (loop ? wrap(i, count) : Math.max(0, Math.min(count - 1, i)));
  if (swipe && at(index) === from) index = from + swipe;
  return at(index);
}
