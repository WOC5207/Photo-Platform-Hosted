"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Button from "@/components/ui/Button";
import SharingPosterSelectionTray from "@/components/sharing-posters/SharingPosterSelectionTray";
import { addLocalPhoto } from "@/components/sharing-posters/localSharingPoster";
import {
  SHARING_POSTER_MAX_PHOTOS,
  type SharingPosterPhotoValue,
  type SharingPosterResolvedPhoto
} from "@/lib/sharingPoster";

/**
 * The public editor's picker: the visitor's own photographs, read in the
 * browser instead of chosen from a gallery. Nothing is uploaded.
 */
export default function SharingPosterLocalPhotoPicker({
  photos,
  onAdd,
  onRemove,
  onMove,
  onSelect
}: {
  photos: SharingPosterResolvedPhoto[];
  onAdd: (photo: SharingPosterPhotoValue) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations("sharingPosters");
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failed, setFailed] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [dragging, setDragging] = useState(false);
  const room = SHARING_POSTER_MAX_PHOTOS - photos.length;

  async function add(files: File[]) {
    const images = files.filter((file) => file.type.startsWith("image/") || file.type === "");
    if (images.length === 0 || progress) return;
    const accepted = images.slice(0, Math.max(0, room));
    setSkipped(images.length - accepted.length);
    setFailed(0);
    setProgress({ done: 0, total: accepted.length });
    let failures = 0;
    // One at a time: a full-size photograph decodes into a lot of memory.
    for (const [index, file] of accepted.entries()) {
      try {
        onAdd(await addLocalPhoto(file));
      } catch {
        failures += 1;
      }
      setProgress({ done: index + 1, total: accepted.length });
    }
    setFailed(failures);
    setProgress(null);
  }

  return (
    <div className="space-y-5">
      <SharingPosterSelectionTray photos={photos} onRemove={onRemove} onMove={onMove} onSelect={onSelect} emptyLabel={t("localSelectionEmpty")} />

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void add(Array.from(event.dataTransfer.files));
        }}
        className={`flex flex-col items-center gap-3 rounded-xl border border-dashed p-6 text-center transition-colors ${dragging ? "border-accent bg-accent-surface" : "border-border-strong bg-raised"}`}
      >
        <p className="text-sm font-semibold">{t("localAddTitle")}</p>
        <p className="max-w-md text-xs leading-5 text-fg-subtle">{t("localAddHint")}</p>
        <Button variant="primary" disabled={room <= 0 || progress !== null} onClick={() => inputRef.current?.click()}>
          {progress ? t("localReading", { done: progress.done, total: progress.total }) : t("localAddButton")}
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.currentTarget.value = "";
            void add(files);
          }}
        />
        {room <= 0 && <p className="text-xs text-fg-subtle">{t("localFull")}</p>}
      </div>
      {progress && <p role="status" className="text-sm text-fg-subtle">{t("localReading", { done: progress.done, total: progress.total })}</p>}
      {failed > 0 && <p role="alert" className="text-sm text-danger">{t("localReadError", { count: failed })}</p>}
      {skipped > 0 && <p role="status" className="text-sm text-warning">{t("localSkipped", { count: skipped })}</p>}
    </div>
  );
}
