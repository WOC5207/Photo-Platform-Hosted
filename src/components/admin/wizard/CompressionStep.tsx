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

export default function CompressionStep({
  queue,
  allowOriginal
}: {
  queue: PendingUploadQueue;
  allowOriginal: boolean;
}) {
  const t = useTranslations("adminEvents");
  const tw = useTranslations("photoWizard");

  // Browsable photos include those still compressing/optimizing in the
  // background, not just fully-ready ones — so a tile never vanishes while its
  // compression (initial or a preset change) is in flight.
  const photos = queue.browsableFiles;

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(photos.map((item) => item.photoId))
  );
  const [preset, setPreset] = useState<StoragePreset>("balanced");
  const [applying, setApplying] = useState(false);
  // Pre-migration pending uploads have no retained source and stay Original;
  // they are excluded from bulk preset changes but still publish normally.
  const adjustable = photos.filter((item) => item.sourceBytes != null);
  const selectedAdjustable = adjustable.filter((item) =>
    selected.has(item.photoId)
  );
  const busy = applying || queue.locked || queue.clearing || queue.queueWorking;

  const knownFinalBytes = photos
    .map((item) => item.finalBytes)
    .filter((bytes): bytes is number => bytes != null);
  const totalFinalBytes = knownFinalBytes.reduce((sum, bytes) => sum + bytes, 0);

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
        if (item.storagePreset === preset) continue;
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
          {t("storagePresetPhotoLabel")}
          <select
            aria-label={t("storagePresetPhotoLabel")}
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
            {tw("applyToSelected", { count: selectedAdjustable.length })}
          </button>
          <button
            type="button"
            disabled={busy || adjustable.length === 0}
            onClick={() => void applyPreset(adjustable)}
            className={btnCls}
          >
            {tw("applyToAll")}
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
          return (
            <div className="flex flex-col gap-0.5 text-xs">
              <span className="font-semibold text-fg">
                {working
                  ? t("pendingOptimizing")
                  : presetShortLabel(t, item.storagePreset)}
                {item.finalBytes != null && !working && (
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

      <p className="text-sm font-medium text-fg">
        {tw("summaryTotal", { size: formatBytes(totalFinalBytes) })}
      </p>
    </div>
  );
}
