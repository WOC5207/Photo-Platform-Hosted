"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Button from "@/components/ui/Button";
import FilterToolbar from "@/components/ui/FilterToolbar";
import type { SharingPosterPhotoValue, SharingPosterResolvedPhoto } from "@/lib/sharingPoster";

const fieldClasses =
  "min-h-11 w-full rounded-lg border border-border-strong bg-control px-3 py-2 text-base text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 sm:text-sm";

export default function SharingPosterPhotoPicker({
  locale,
  events,
  photos,
  onAdd,
  onRemove,
  onMove,
  onSelect
}: {
  locale: string;
  events: { id: string; title: string }[];
  photos: SharingPosterResolvedPhoto[];
  onAdd: (photo: SharingPosterPhotoValue) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations("sharingPosters");
  const [eventId, setEventId] = useState("");
  const [credit, setCredit] = useState("");
  const [appliedCredit, setAppliedCredit] = useState("");
  const [items, setItems] = useState<SharingPosterPhotoValue[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const requestSequence = useRef(0);
  const selected = new Set(photos.map((photo) => photo.photoId));

  const load = useCallback(
    async (cursor: string | null, append: boolean) => {
      const sequence = ++requestSequence.current;
      setLoading(true);
      setError(false);
      try {
        const params = new URLSearchParams({ locale });
        if (eventId) params.set("event", eventId);
        if (appliedCredit) params.set("credit", appliedCredit);
        if (cursor) params.set("cursor", cursor);
        const response = await fetch(`/api/dashboard/sharing-posters/photos?${params}`, {
          cache: "no-store"
        });
        if (!response.ok) throw new Error("load_failed");
        const page = (await response.json()) as {
          items: SharingPosterPhotoValue[];
          nextCursor: string | null;
          total: number;
        };
        if (sequence !== requestSequence.current) return;
        setItems((current) => (append ? [...current, ...page.items] : page.items));
        setNextCursor(page.nextCursor);
        setTotal(page.total);
      } catch {
        if (sequence === requestSequence.current) setError(true);
      } finally {
        if (sequence === requestSequence.current) setLoading(false);
      }
    },
    [locale, eventId, appliedCredit]
  );

  useEffect(() => {
    void load(null, false);
  }, [load]);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-raised p-3 shadow-[0_8px_24px_rgb(0_0_0/0.08)] lg:sticky lg:top-4 lg:z-10">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">{t("selectionTray")}</p>
            <p className="text-xs text-fg-subtle">{t("selectionCount", { count: photos.length })}</p>
          </div>
          <span className="font-meta text-xs text-accent">{photos.length} / 9</span>
        </div>
        {photos.length === 0 ? (
          <p className="rounded-lg bg-control px-3 py-3 text-sm text-fg-subtle">{t("selectionEmpty")}</p>
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

      <FilterToolbar label={t("results")} count={total}>
        <label className="grid gap-1 text-sm font-semibold text-fg-muted">
          {t("galleryFilter")}
          <select value={eventId} onChange={(event) => setEventId(event.target.value)} className={fieldClasses}>
            <option value="">{t("allGalleries")}</option>
            {events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}
          </select>
        </label>
        <form
          className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const nextCredit = credit.trim();
            if (nextCredit === appliedCredit) void load(null, false);
            else setAppliedCredit(nextCredit);
          }}
        >
          <label className="grid gap-1 text-sm font-semibold text-fg-muted">
            {t("cosplayerFilter")}
            <input value={credit} onChange={(event) => setCredit(event.target.value)} className={fieldClasses} />
          </label>
          <Button type="submit">{t("applyFilter")}</Button>
        </form>
      </FilterToolbar>

      {error ? (
        <div role="alert" className="rounded-xl border border-danger-border bg-danger-surface p-4 text-sm text-danger">
          {t("photoLoadError")} <Button className="ml-2" onClick={() => void load(null, false)}>{t("retry")}</Button>
        </div>
      ) : items.length === 0 && !loading ? (
        <p className="rounded-xl border border-border bg-surface p-5 text-sm text-fg-subtle">{t("noPhotoMatches")}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((photo) => {
            const checked = selected.has(photo.id);
            return (
              <li key={photo.id}>
                <button
                  type="button"
                  aria-pressed={checked}
                  disabled={!checked && photos.length >= 9}
                  onClick={() => (checked ? onRemove(photo.id) : onAdd(photo))}
                  className={`group relative block w-full overflow-hidden rounded-lg border text-left transition-[border-color,opacity,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 ${checked ? "border-accent" : "border-border hover:border-accent/45"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.thumbUrl} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />
                  <span className="absolute inset-x-0 bottom-0 bg-black/70 px-2 py-2 text-xs text-white">
                    <span className="block truncate font-semibold">{photo.eventTitle}</span>
                    <span className="block truncate text-white/75">{photo.creditNames.join(" / ") || t("missingCn")}</span>
                  </span>
                  {checked && <span className="font-meta absolute right-2 top-2 rounded-md bg-accent px-2 py-1 text-xs font-semibold text-accent-fg">{photos.findIndex((item) => item.photoId === photo.id) + 1}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {loading && <p role="status" className="text-sm text-fg-subtle">{t("loadingPhotos")}</p>}
      {nextCursor && !loading && <Button onClick={() => void load(nextCursor, true)}>{t("loadMore")}</Button>}
    </div>
  );
}
