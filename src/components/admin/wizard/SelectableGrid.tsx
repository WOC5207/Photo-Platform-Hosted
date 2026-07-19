"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

export interface GridPhoto {
  photoId: string;
  name: string;
  previewUrl?: string;
}

/**
 * Multi-select thumbnail grid shared by the compression and credits steps.
 * Each tile is a toggle button (aria-pressed) with an explicit check mark so
 * selection works with keyboard, screen reader and touch alike.
 */
export default function SelectableGrid({
  photos,
  selected,
  onToggle,
  disabled,
  renderFooter
}: {
  photos: GridPhoto[];
  selected: Set<string>;
  onToggle: (photoId: string) => void;
  disabled?: boolean;
  renderFooter?: (photo: GridPhoto) => ReactNode;
}) {
  const t = useTranslations("adminEvents");

  return (
    <ul
      data-testid="wizard-photo-grid"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
    >
      {photos.map((photo) => {
        const isSelected = selected.has(photo.photoId);
        return (
          <li key={photo.photoId} className="flex flex-col gap-1">
            <button
              type="button"
              aria-pressed={isSelected}
              aria-label={`${t("bulkSelectPhotoLabel")} ${photo.name}`}
              disabled={disabled}
              onClick={() => onToggle(photo.photoId)}
              className={`group relative block aspect-[4/3] w-full overflow-hidden rounded-lg border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40 disabled:opacity-60 ${
                isSelected
                  ? "border-fg ring-2 ring-fg/60"
                  : "border-border hover:border-fg-subtle"
              }`}
            >
              {photo.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photo.previewUrl}
                  alt={photo.name}
                  width={320}
                  height={240}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full items-center justify-center px-2 text-center text-xs text-fg-subtle">
                  {photo.name}
                </span>
              )}
              <span
                aria-hidden="true"
                className={`absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border text-xs font-bold transition ${
                  isSelected
                    ? "border-fg bg-fg text-page"
                    : "border-white/80 bg-black/30 text-transparent group-hover:text-white/70"
                }`}
              >
                ✓
              </span>
            </button>
            {renderFooter?.(photo)}
          </li>
        );
      })}
    </ul>
  );
}
