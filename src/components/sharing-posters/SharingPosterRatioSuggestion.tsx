"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Button from "@/components/ui/Button";
import type { SharingPosterComposition, SharingPosterResolvedPhoto } from "@/lib/sharingPoster";
import {
  candidatePosterRatios,
  evaluatePosterRatio,
  pickPosterRatioSuggestion,
  posterRatioLabel,
  type PosterRatio,
  type PosterRatioReport,
  type PosterRatioSuggestion
} from "@/lib/sharingPosterRatio";

/** Wait for edits to settle before comparing ratios. */
const SETTLE_MS = 350;

export interface PosterRatioSuggestionState {
  suggestion: PosterRatioSuggestion | null;
  /** False while the inputs have changed since `suggestion` was computed. */
  fresh: boolean;
}

/**
 * Compare every candidate ratio for the current photographs, off the typing
 * path: after edits settle, one ratio per task, since at nine photographs the
 * layout solver takes about 20 ms a ratio. Only what moves the layout or the
 * crops triggers a new comparison; credits text and colours do not.
 */
export function usePosterRatioSuggestion(
  composition: SharingPosterComposition,
  photos: SharingPosterResolvedPhoto[],
  lineCount: number
): PosterRatioSuggestionState {
  const { style, ratio } = composition;
  const key = useMemo(
    () =>
      JSON.stringify({
        ratio: [ratio.width, ratio.height],
        style: [style.marginPercent, style.gapPercent, style.footerTextPercent, style.textGapPercent ?? null],
        lineCount,
        photos: photos.map((photo) => [
          photo.photoId,
          photo.composition.weight,
          photo.composition.focalX,
          photo.composition.focalY,
          photo.composition.crop ?? null,
          photo.source ? [photo.source.width, photo.source.height, photo.source.subject] : null
        ])
      }),
    [
      ratio.width,
      ratio.height,
      style.marginPercent,
      style.gapPercent,
      style.footerTextPercent,
      style.textGapPercent,
      lineCount,
      photos
    ]
  );
  const inputs = useRef({ composition, photos, lineCount });
  inputs.current = { composition, photos, lineCount };
  const [result, setResult] = useState<{ key: string; suggestion: PosterRatioSuggestion | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const current = inputs.current;
      if (!current.photos.some((photo) => photo.source)) {
        setResult({ key, suggestion: null });
        return;
      }
      const reports: PosterRatioReport[] = [];
      for (const candidate of candidatePosterRatios(current.composition.ratio)) {
        if (cancelled) return;
        reports.push(
          evaluatePosterRatio(candidate, current.photos, current.composition.style, current.lineCount)
        );
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      }
      if (!cancelled) {
        setResult({ key, suggestion: pickPosterRatioSuggestion(current.composition.ratio, reports) });
      }
    }, SETTLE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [key]);

  return { suggestion: result?.suggestion ?? null, fresh: result?.key === key };
}

function percent(value: number): number {
  return Math.round(value * 100);
}

export default function SharingPosterRatioSuggestion({
  state,
  detecting,
  onApply
}: {
  state: PosterRatioSuggestionState;
  /** Some photographs are still waiting for subject detection. */
  detecting: boolean;
  onApply: (ratio: PosterRatio) => void;
}) {
  const t = useTranslations("sharingPosters");
  const { suggestion, fresh } = state;
  if (!suggestion) {
    return fresh ? null : (
      <p role="status" className="mt-4 text-sm text-fg-subtle">
        {t("ratioSuggestionUpdating")}
      </p>
    );
  }
  const { best, current, switchSuggested } = suggestion;
  const label = posterRatioLabel(best.ratio);

  return (
    <section
      aria-labelledby="ratio-suggestion-title"
      aria-busy={!fresh}
      className={`mt-4 rounded-lg border px-4 py-3 transition-opacity ${
        switchSuggested ? "border-accent/40 bg-accent-surface/60" : "border-border bg-raised"
      } ${fresh ? "" : "opacity-60"}`}
    >
      <h3 id="ratio-suggestion-title" className="font-meta text-xs font-semibold tracking-[0.12em] text-accent">
        {t("ratioSuggestionTitle")}
      </h3>
      <p role="status" className="mt-1 text-sm font-semibold text-fg">
        {switchSuggested
          ? t("ratioSuggestionBetter", { ratio: label })
          : best.subjectShown === null
            ? t("ratioSuggestionCurrentPhotos")
            : t("ratioSuggestionCurrent")}
      </p>
      <ul className="mt-2 grid gap-1 text-sm text-fg-muted">
        {best.subjectShown !== null && current.subjectShown !== null && (
          <li>
            {switchSuggested && percent(best.subjectShown) !== percent(current.subjectShown)
              ? t("ratioSuggestionSubjectsCompare", {
                  shown: percent(best.subjectShown),
                  current: percent(current.subjectShown)
                })
              : t("ratioSuggestionSubjects", { shown: percent(best.subjectShown) })}
          </li>
        )}
        <li>
          {switchSuggested && percent(best.shown) !== percent(current.shown)
            ? t("ratioSuggestionShownCompare", { shown: percent(best.shown), current: percent(current.shown) })
            : t("ratioSuggestionShown", { shown: percent(best.shown) })}
        </li>
      </ul>
      {detecting && <p className="mt-2 text-xs text-fg-subtle">{t("ratioSuggestionPending")}</p>}
      <p className="mt-2 text-xs leading-5 text-fg-subtle">{t("ratioSuggestionHint")}</p>
      {switchSuggested && (
        <Button
          variant="primary"
          size="compact"
          className="mt-3"
          disabled={!fresh}
          onClick={() => onApply(best.ratio)}
        >
          {t("ratioSuggestionApply", { ratio: label })}
        </Button>
      )}
    </section>
  );
}
