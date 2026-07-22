"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type {
  PendingUploadQueue,
  QueuedFile,
  StoragePreset
} from "./usePendingUploadQueue";
import SelectableGrid from "./SelectableGrid";
import { btnCls, formatBytes, inputCls } from "./ui";

function presetShortLabel(
  t: (key: string) => string,
  preset: StoragePreset
): string {
  if (preset === "original") return t("storagePresetOriginal");
  return preset === "archive"
    ? t("storagePresetArchiveShort")
    : t("storagePresetBalancedShort");
}

// Longest-edge cap for each compression size. "original" (full resolution)
// keeps the source itself as the master, so it has no cap. These mirror the
// server's CANDIDATE_OPTIONS (archive 6000px, balanced 4096px) in src/lib/images.ts.
const PRESET_MAX_EDGE: Record<StoragePreset, number | null> = {
  original: null,
  archive: 6000,
  balanced: 4096
};

/**
 * A pre-compression size estimate for one photo at a given size, in bytes.
 *
 * Once a photo has finished compressing we know its exact final size, so that
 * measured value is returned unchanged. Before then the estimate scales the
 * stored source bytes by the output/source pixel-area ratio — exact for full
 * resolution (the source IS the master) and an order-of-magnitude guide for the
 * downscaled sizes. Returns null when there is no reliable basis (no retained
 * source or unknown dimensions), so the UI can omit the figure entirely rather
 * than show a fabricated one.
 */
function estimateFinalBytes(
  item: QueuedFile,
  preset: StoragePreset
): number | null {
  // A measured size, when known, always wins over the estimate.
  if (item.finalBytes != null) return item.finalBytes;
  if (item.sourceBytes == null || !item.width || !item.height) return null;
  const maxEdge = PRESET_MAX_EDGE[preset];
  if (maxEdge == null) return item.sourceBytes;
  const longEdge = Math.max(item.width, item.height);
  const scale = longEdge > maxEdge ? maxEdge / longEdge : 1;
  return Math.round(item.sourceBytes * scale * scale);
}

export default function CompressionStep({
  queue,
  allowOriginal
}: {
  queue: PendingUploadQueue;
  allowOriginal: boolean;
}) {
  const t = useTranslations("adminEvents");
  const tw = useTranslations("photoWizard");

  // Browsable photos include those still awaiting a size choice or compressing
  // in the background, not just fully-ready ones — so a tile never vanishes
  // while its compression (initial or a size change) is in flight.
  const photos = queue.browsableFiles;

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(photos.map((item) => item.photoId))
  );
  const [preset, setPreset] = useState<StoragePreset>("balanced");
  const [applying, setApplying] = useState(false);
  // Pre-migration pending uploads have no retained source and stay Original;
  // they are excluded from bulk size changes but still publish normally.
  const adjustable = photos.filter((item) => item.sourceBytes != null);
  const selectedAdjustable = adjustable.filter((item) =>
    selected.has(item.photoId)
  );
  const busy = applying || queue.locked || queue.clearing || queue.queueWorking;

  // Estimated total at the currently-selected size, computed from data already
  // on the client. Shown until every photo has a measured size, at which point
  // the exact total replaces it. Omitted if any photo can't be estimated.
  const estimates = photos.map((item) => estimateFinalBytes(item, preset));
  const allMeasured =
    photos.length > 0 && photos.every((item) => item.finalBytes != null);
  const estimableTotal = estimates.every((value) => value != null)
    ? estimates.reduce((sum, value) => sum + (value ?? 0), 0)
    : null;
  const measuredTotal = photos.reduce(
    (sum, item) => sum + (item.finalBytes ?? 0),
    0
  );

  function toggle(photoId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  }

  async function applyPreset(targets: (QueuedFile & { photoId: string })[]) {
    if (busy || targets.length === 0) return;
    setApplying(true);
    try {
      // Sequential PUTs keep Sharp/disk pressure predictable on the NAS, the
      // same reason uploads are chained one at a time.
      for (const item of targets) {
        // An awaiting photo has never been compressed, so it always needs the
        // encode kicked off — even when its placeholder size happens to equal
        // the chosen one. Already-compressed photos at the same size are a no-op.
        if (item.state !== "awaiting" && item.storagePreset === preset) continue;
        await queue.changeStoragePreset(item, preset);
      }
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-fg-muted">{tw("compressIntro")}</p>
      <p className="text-xs text-fg-subtle">{t("pendingStorageNotice")}</p>
      {!allowOriginal && (
        <p className="text-xs text-fg-subtle">{t("storageOriginalDisabled")}</p>
      )}

      <div className="flex flex-col gap-3 rounded-lg border border-border-strong/60 bg-surface/50 p-3 sm:flex-row sm:items-end sm:justify-between">
        <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-fg-muted sm:max-w-72 sm:flex-1">
          {tw("compressSizeLabel")}
          <select
            aria-label={tw("compressSizeLabel")}
            value={preset}
            disabled={busy}
            onChange={(event) => setPreset(event.target.value as StoragePreset)}
            className={inputCls}
          >
            {allowOriginal && (
              <option value="original">{t("storagePresetOriginal")}</option>
            )}
            <option value="archive">{t("storagePresetArchive")}</option>
            <option value="balanced">{t("storagePresetBalanced")}</option>
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy || selectedAdjustable.length === 0}
            onClick={() => void applyPreset(selectedAdjustable)}
            className={btnCls}
          >
            {tw("compressSelected", { count: selectedAdjustable.length })}
          </button>
          <button
            type="button"
            disabled={busy || adjustable.length === 0}
            onClick={() => void applyPreset(adjustable)}
            className={btnCls}
          >
            {tw("compressAll")}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-fg-subtle">
        <button
          type="button"
          disabled={busy}
          onClick={() => setSelected(new Set(photos.map((item) => item.photoId)))}
          className={`${btnCls} min-h-8 px-2 py-1`}
        >
          {t("bulkSelectAllVisible")}
        </button>
        <button
          type="button"
          disabled={busy || selected.size === 0}
          onClick={() => setSelected(new Set())}
          className={`${btnCls} min-h-8 px-2 py-1`}
        >
          {t("bulkClearSelection")}
        </button>
        <span role="status">{t("bulkSelectedCount", { count: selected.size })}</span>
      </div>

      <SelectableGrid
        photos={photos}
        selected={selected}
        onToggle={toggle}
        disabled={busy}
        renderFooter={(photo) => {
          const item = photos.find(
            (candidate) => candidate.photoId === photo.photoId
          );
          if (!item) return null;
          const working =
            item.state === "optimizing" || item.state === "compressing";
          const awaiting = item.state === "awaiting";
          // For a photo not yet compressed, preview the size it would take at
          // the currently-selected option so the grid updates as the user
          // compares sizes.
          const estimate = awaiting ? estimateFinalBytes(item, preset) : null;
          return (
            <div className="flex flex-col gap-0.5 text-xs">
              <span className="font-semibold text-fg">
                {awaiting
                  ? tw("awaitingCompression")
                  : working
                    ? t("pendingOptimizing")
                    : presetShortLabel(t, item.storagePreset)}
                {awaiting && estimate != null && (
                  <span className="ml-1 font-normal text-fg-subtle">
                    · {tw("estimatedSize", { size: formatBytes(estimate) })}
                  </span>
                )}
                {item.finalBytes != null && !working && !awaiting && (
                  <span className="ml-1 font-normal text-fg-subtle">
                    · {formatBytes(item.finalBytes)}
                  </span>
                )}
              </span>
              {item.sourceBytes == null && (
                <span className="text-fg-subtle">{t("storageLegacyPending")}</span>
              )}
              {item.sourceBytes != null &&
                item.candidateBytes != null &&
                item.storagePreset !== "original" && (
                  <span
                    className={
                      item.candidateBytes <= item.sourceBytes
                        ? "text-success"
                        : "text-danger"
                    }
                  >
                    {item.candidateBytes <= item.sourceBytes
                      ? t("storageSavings", {
                          percent: Math.round(
                            (1 - item.candidateBytes / item.sourceBytes) * 100
                          )
                        })
                      : t("storageIncrease", {
                          amount: formatBytes(item.candidateBytes - item.sourceBytes)
                        })}
                  </span>
                )}
              {item.presetError && (
                <span role="alert" className="text-danger">
                  {item.presetError === "quotaExceeded"
                    ? t("storagePresetQuotaError")
                    : item.presetError === "legacyPending"
                      ? t("storageLegacyPending")
                      : t("storagePresetError")}
                </span>
              )}
            </div>
          );
        }}
      />

      {allMeasured ? (
        <p className="text-sm font-medium text-fg">
          {tw("summaryTotal", { size: formatBytes(measuredTotal) })}
        </p>
      ) : estimableTotal != null ? (
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium text-fg">
            {tw("estimatedTotal", { size: formatBytes(estimableTotal) })}
          </p>
          <p className="text-xs text-fg-subtle">{tw("estimateNote")}</p>
        </div>
      ) : null}
    </div>
  );
}
