"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Button from "@/components/ui/Button";
import FilterToolbar from "@/components/ui/FilterToolbar";
import SharingPosterSelectionTray from "@/components/sharing-posters/SharingPosterSelectionTray";
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
      <SharingPosterSelectionTray photos={photos} onRemove={onRemove} onMove={onMove} onSelect={onSelect} />

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
