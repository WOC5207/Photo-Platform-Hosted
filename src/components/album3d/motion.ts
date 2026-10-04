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
