import { homePhotoWeightScale } from "@/lib/homePhotoWeight";
import {
  SUBJECT_CLIP_WEIGHT,
  calculateSharingPosterLayout,
  posterLayoutItems,
  resolvePosterCrop,
  sharingPosterFooterGeometry,
  type PosterLayoutSource
} from "@/lib/sharingPosterLayout";

/**
 * Which poster ratio suits a set of photographs.
 *
 * Each candidate ratio is laid out with the real solver at the preview's width,
 * so the layout scored is the layout the owner would get, and every frame is
 * then cropped exactly as the renderer will crop it. The score is the solver's
 * own objective measured on those crops: how much of each photograph is cut
 * away, as `-ln(share kept)`, plus three times the share of each detected
 * subject left outside its frame, weighted like the layout weights photos. A
 * small term for the share of the poster not given to photographs keeps a very
 * wide ratio, where the credits take a larger slice of the height, from
 * winning on a technicality. Ratios whose credits would crowd the photographs
 * out are never suggested.
 *
 * Unlike the layout, which knows a subject only when the crop follows it, the
 * score counts every detected subject, since a manual crop that cuts one off
 * is still a cut-off subject on the poster.
 *
 * What the owner is shown are two shares: how much of the subjects and how
 * much of the photographs stay in view. A different ratio is suggested only
 * when it keeps at least as much of both, within a point, and clearly more of
 * one, so a suggestion can always be read off those two numbers and never
 * trades one against the other behind the owner's back. Among such ratios the
 * cost above decides, which prefers layouts that crop every photograph evenly
 * and give the photographs more of the poster.
 */

export interface PosterRatio {
  width: number;
  height: number;
}

export interface NamedPosterRatio extends PosterRatio {
  label: string;
}

/** The ratios offered as buttons in the editor, in their order there. */
export const SHARING_POSTER_RATIO_PRESETS: readonly NamedPosterRatio[] = [
  { width: 1, height: 1, label: "1:1" },
  { width: 4, height: 5, label: "4:5" },
  { width: 9, height: 16, label: "9:16" },
  { width: 16, height: 9, label: "16:9" },
  { width: 18, height: 9, label: "18:9" },
  { width: 4, height: 3, label: "4:3" }
];

/**
 * Common ratios considered for a suggestion without a button of their own:
 * 3:4, the portrait format of Xiaohongshu, and the camera's native 2:3 and 3:2.
 */
export const SHARING_POSTER_RATIO_EXTRAS: readonly NamedPosterRatio[] = [
  { width: 3, height: 4, label: "3:4" },
  { width: 2, height: 3, label: "2:3" },
  { width: 3, height: 2, label: "3:2" }
];

/** The layout settings the score depends on; the colours and credits do not matter. */
export interface PosterRatioStyle {
  marginPercent: number;
  gapPercent: number;
  footerTextPercent: number;
  textGapPercent?: number;
}

export interface PosterRatioReport {
  ratio: PosterRatio;
  /** Lower is better. */
  cost: number;
  /** Layout-weighted share of each photograph that stays in view, 0..1. */
  shown: number;
  /** Photographs with a detected subject box. */
  subjects: number;
  /** Of those, the ones with at least 98 % of the box in view. */
  subjectsWhole: number;
  /**
   * Layout-weighted share of the subject boxes that stays in view, 0..1, or
   * null when no photograph has a detected subject.
   */
  subjectShown: number | null;
  /** Share of the poster given to photographs. */
  photoShare: number;
  /** The credits leave too little room; such a ratio is never suggested. */
  footerTooTall: boolean;
}

export interface PosterRatioSuggestion {
  current: PosterRatioReport;
  best: PosterRatioReport;
  /** True when switching to `best` is worth recommending over the current ratio. */
  switchSuggested: boolean;
}

/** The editor preview's width, so the layout scored is the layout previewed. */
export const RATIO_REFERENCE_WIDTH = 900;
/** Weight of the share of the poster not given to photographs. */
const SPACE_WEIGHT = 0.5;
/** Share of a subject box that must stay in view for it to count as whole. */
const WHOLE_SUBJECT = 0.98;
/** A suggested switch may lose at most this much of either share... */
const NOT_WORSE = 0.01;
/** ...and must gain at least this much of one. */
const CLEARLY_BETTER = 0.02;

function greatestCommonDivisor(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) [x, y] = [y, x % y];
  return x || 1;
}

export function sameRatio(a: PosterRatio, b: PosterRatio): boolean {
  return a.width * b.height === a.height * b.width;
}

/**
 * A preset or common ratio by its usual name (18:9 stays 18:9); any other
 * shape reduced, so `8:10` reads as `4:5`.
 */
export function posterRatioLabel(ratio: PosterRatio): string {
  const named = [...SHARING_POSTER_RATIO_PRESETS, ...SHARING_POSTER_RATIO_EXTRAS].find((candidate) =>
    sameRatio(candidate, ratio)
  );
  if (named) return named.label;
  const divisor = greatestCommonDivisor(ratio.width, ratio.height);
  return `${Math.round(ratio.width) / divisor}:${Math.round(ratio.height) / divisor}`;
}

/** Presets, then the extra common ratios, then the current one if it is none of those. */
export function candidatePosterRatios(current: PosterRatio): PosterRatio[] {
  const candidates: PosterRatio[] = [...SHARING_POSTER_RATIO_PRESETS, ...SHARING_POSTER_RATIO_EXTRAS].map(
    ({ width, height }) => ({ width, height })
  );
  if (!candidates.some((candidate) => sameRatio(candidate, current))) {
    candidates.push({ width: current.width, height: current.height });
  }
  return candidates;
}

/** Score one ratio for these photographs. Pure and deterministic. */
export function evaluatePosterRatio(
  ratio: PosterRatio,
  photos: readonly PosterLayoutSource[],
  style: PosterRatioStyle,
  lineCount: number
): PosterRatioReport {
  const width = RATIO_REFERENCE_WIDTH;
  const height = Math.round((width * ratio.height) / ratio.width);
  const geometry = sharingPosterFooterGeometry({
    width,
    height,
    lineCount,
    marginPercent: style.marginPercent,
    footerTextPercent: style.footerTextPercent,
    textGapPercent: style.textGapPercent
  });
  const gap = (width * style.gapPercent) / 100;
  const rectangles = calculateSharingPosterLayout(posterLayoutItems(photos), geometry.photoArea, gap);

  let totalWeight = 0;
  let cropCost = 0;
  let shownSum = 0;
  let subjects = 0;
  let subjectsWhole = 0;
  let subjectWeight = 0;
  let subjectShownSum = 0;
  let photoArea = 0;
  for (const rect of rectangles) {
    const photo = photos.find((candidate) => candidate.photoId === rect.id);
    const source = photo?.source;
    if (!photo || !source || source.width <= 0 || source.height <= 0) continue;
    const weight = homePhotoWeightScale(photo.composition.weight);
    const crop = resolvePosterCrop(
      photo.composition,
      source.subject,
      source.width,
      source.height,
      rect.width,
      rect.height
    );
    const kept = Math.min(1, (crop.width * crop.height) / (source.width * source.height));
    totalWeight += weight;
    shownSum += kept * weight;
    cropCost += -Math.log(Math.max(0.01, kept)) * weight;
    photoArea += rect.width * rect.height;

    const box = source.subject?.box;
    if (box && box.width > 0 && box.height > 0) {
      const boxX = box.x * source.width;
      const boxY = box.y * source.height;
      const boxWidth = box.width * source.width;
      const boxHeight = box.height * source.height;
      const overlapWidth = Math.max(0, Math.min(boxX + boxWidth, crop.x + crop.width) - Math.max(boxX, crop.x));
      const overlapHeight = Math.max(0, Math.min(boxY + boxHeight, crop.y + crop.height) - Math.max(boxY, crop.y));
      const inView = (overlapWidth * overlapHeight) / (boxWidth * boxHeight);
      subjects += 1;
      if (inView >= WHOLE_SUBJECT) subjectsWhole += 1;
      subjectWeight += weight;
      subjectShownSum += inView * weight;
      cropCost += SUBJECT_CLIP_WEIGHT * (1 - inView) * weight;
    }
  }

  const photoShare = photoArea / (width * height);
  return {
    ratio: { width: ratio.width, height: ratio.height },
    cost: (totalWeight > 0 ? cropCost / totalWeight : 0) + SPACE_WEIGHT * (1 - photoShare),
    shown: totalWeight > 0 ? shownSum / totalWeight : 0,
    subjects,
    subjectsWhole,
    subjectShown: subjectWeight > 0 ? subjectShownSum / subjectWeight : null,
    photoShare,
    footerTooTall: geometry.footerTooTall
  };
}

/**
 * Whether `candidate` keeps at least as much of the subjects and of the
 * photographs in view as `current`, within a point, and clearly more of one.
 */
export function improvesOnPosterRatio(candidate: PosterRatioReport, current: PosterRatioReport): boolean {
  const subjectGain =
    candidate.subjectShown !== null && current.subjectShown !== null
      ? candidate.subjectShown - current.subjectShown
      : 0;
  const shownGain = candidate.shown - current.shown;
  if (subjectGain < -NOT_WORSE || shownGain < -NOT_WORSE) return false;
  return subjectGain >= CLEARLY_BETTER || shownGain >= CLEARLY_BETTER;
}

/**
 * Whether to suggest leaving `current`, and for what. Only ratios that improve
 * on it qualify, and the cheapest of those is suggested; earlier candidates win
 * ties, so the presets come first. A ratio whose credits would crowd out the
 * photographs is never suggested, and one the owner is already on is always
 * worth leaving for the cheapest ratio that is not.
 */
export function pickPosterRatioSuggestion(
  current: PosterRatio,
  reports: readonly PosterRatioReport[]
): PosterRatioSuggestion | null {
  const currentReport = reports.find((report) => sameRatio(report.ratio, current));
  if (!currentReport) return null;
  const eligible = reports.filter((report) => !report.footerTooTall);
  const improvers = eligible.filter(
    (report) =>
      !sameRatio(report.ratio, current) &&
      (currentReport.footerTooTall || improvesOnPosterRatio(report, currentReport))
  );
  // Prefer a ratio that nothing else improves on, so taking a suggestion never
  // leads straight to another one. Improvement always gains more than it can
  // lose, so it cannot go round in a circle and such a ratio exists.
  const settled = improvers.filter(
    (report) => !eligible.some((other) => other !== report && improvesOnPosterRatio(other, report))
  );
  let best: PosterRatioReport | null = null;
  for (const report of settled.length > 0 ? settled : improvers) {
    if (!best || report.cost < best.cost - 1e-9) best = report;
  }
  return best
    ? { current: currentReport, best, switchSuggested: true }
    : { current: currentReport, best: currentReport, switchSuggested: false };
}

/** Everything at once; the editor runs the same steps a candidate at a time. */
export function suggestPosterRatio(
  current: PosterRatio,
  photos: readonly PosterLayoutSource[],
  style: PosterRatioStyle,
  lineCount: number
): PosterRatioSuggestion | null {
  if (!photos.some((photo) => photo.source)) return null;
  const reports = candidatePosterRatios(current).map((ratio) =>
    evaluatePosterRatio(ratio, photos, style, lineCount)
  );
  return pickPosterRatioSuggestion(current, reports);
}
