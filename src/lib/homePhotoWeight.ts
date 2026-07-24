export const HOME_PHOTO_WEIGHT_MIN = 1;
export const HOME_PHOTO_WEIGHT_MAX = 5;
export const HOME_PHOTO_WEIGHT_FALLBACK = 3;

/** Keep persisted or legacy values safe before they reach layout arithmetic. */
export function normalizeHomePhotoWeight(value: number): number {
  if (!Number.isFinite(value)) return HOME_PHOTO_WEIGHT_FALLBACK;
  return Math.min(
    HOME_PHOTO_WEIGHT_MAX,
    Math.max(HOME_PHOTO_WEIGHT_MIN, Math.round(value))
  );
}

/**
 * Translate the photographer's 1-5 preference into a target-area multiplier
 * for the justified homepage mosaic. The bounded scale keeps low-weight photos
 * usable on mobile while making high-weight photos visibly more prominent.
 */
export function homePhotoWeightScale(value: number): number {
  const weight = normalizeHomePhotoWeight(value);
  return 0.75 + (weight - HOME_PHOTO_WEIGHT_MIN) * 0.25;
}
