"use client";

import { useTranslations } from "next-intl";
import type { SharingPosterResolvedPhoto } from "@/lib/sharingPoster";

/** The poster's photographs in order, to select, reorder and remove; shared by the gallery and upload pickers. */
export default function SharingPosterSelectionTray({
  photos,
  onRemove,
  onMove,
  onSelect,
  emptyLabel
}: {
  photos: SharingPosterResolvedPhoto[];
  onRemove: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onSelect: (id: string) => void;
  emptyLabel?: string;
}) {
  const t = useTranslations("sharingPosters");
  return (
    <div className="rounded-xl border border-border bg-raised p-3 shadow-[0_8px_24px_rgb(0_0_0/0.08)] lg:sticky lg:top-4 lg:z-10">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{t("selectionTray")}</p>
          <p className="text-xs text-fg-subtle">{t("selectionCount", { count: photos.length })}</p>
        </div>
        <span className="font-meta text-xs text-accent">{photos.length} / 9</span>
      </div>
      {photos.length === 0 ? (
        <p className="rounded-lg bg-control px-3 py-3 text-sm text-fg-subtle">{emptyLabel ?? t("selectionEmpty")}</p>
      ) : (
        <ol className="flex gap-2 overflow-x-auto pb-1">
          {photos.map((photo, index) => (
            <li key={photo.photoId} className="w-28 shrink-0 rounded-lg border border-border bg-surface p-2">
              <button type="button" onClick={() => onSelect(photo.photoId)} className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
                <span className="font-meta mb-1 block text-[0.6875rem] text-accent">{String(index + 1).padStart(2, "0")}</span>
                {photo.source ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo.source.thumbUrl} alt="" className="ui-image-frame aspect-square w-full rounded-md object-cover" />
                ) : (
                  <span className="flex aspect-square items-center justify-center rounded-md bg-control text-xs text-danger">{t("unavailable")}</span>
                )}
              </button>
              <div className="mt-2 grid grid-cols-3 gap-1">
                <button type="button" disabled={index === 0} aria-label={t("moveEarlier")} onClick={() => onMove(photo.photoId, -1)} className="min-h-11 rounded-md text-fg-subtle hover:bg-accent-surface disabled:opacity-30 sm:min-h-10">←</button>
                <button type="button" disabled={index === photos.length - 1} aria-label={t("moveLater")} onClick={() => onMove(photo.photoId, 1)} className="min-h-11 rounded-md text-fg-subtle hover:bg-accent-surface disabled:opacity-30 sm:min-h-10">→</button>
                <button type="button" aria-label={t("removePhoto")} onClick={() => onRemove(photo.photoId)} className="min-h-11 rounded-md text-danger hover:bg-danger-surface sm:min-h-10">×</button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
