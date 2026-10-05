"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { SharingPosterPhotoValue } from "@/lib/sharingPoster";
import { fieldClass, metaLabel, secondaryClass } from "../../booking/shared";
import { useSharepostStudio } from "./SharepostStudio";

/**
 * A saved poster's photographs come from the photographer's galleries: the
 * classic editor's picker, filtered by gallery or cosplayer, with a pressed
 * thumbnail for each photograph on the poster.
 */
export default function SharepostGallery({ onClose }: { onClose: () => void }) {
  const ts = useTranslations("sharingPosters");
  const tc = useTranslations("common");
  const locale = useLocale();
  const studio = useSharepostStudio();
  const events = studio.project?.events ?? [];
  const [event, setEvent] = useState("");
  const [credit, setCredit] = useState("");
  const [applied, setApplied] = useState("");
  const [items, setItems] = useState<SharingPosterPhotoValue[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const sequence = useRef(0);
  const chosen = studio.photos.map((photo) => photo.photoId);
  const max = studio.tools?.SHARING_POSTER_MAX_PHOTOS ?? 9;

  const load = useCallback(
    async (from: string | null) => {
      const at = ++sequence.current;
      setState("loading");
      try {
        const params = new URLSearchParams({ locale });
        if (event) params.set("event", event);
        if (applied) params.set("credit", applied);
        if (from) params.set("cursor", from);
        const response = await fetch(`/api/dashboard/sharing-posters/photos?${params}`, { cache: "no-store" });
        if (!response.ok) throw new Error("load_failed");
        const page = (await response.json()) as { items: SharingPosterPhotoValue[]; nextCursor: string | null; total: number };
        if (at !== sequence.current) return;
        setItems((current) => (from ? [...current, ...page.items] : page.items));
        setCursor(page.nextCursor);
        setTotal(page.total);
        setState("ready");
      } catch {
        if (at === sequence.current) setState("error");
      }
    },
    [locale, event, applied]
  );
  useEffect(() => {
    void load(null);
  }, [load]);

  return (
    <section aria-label={ts("results")} className="mt-6 grid gap-3 border border-border-strong bg-page/70 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className={metaLabel}>
          {ts("selectionCount", { count: chosen.length })} · {ts("results")} {total}
        </p>
        <button type="button" onClick={onClose} className={secondaryClass}>
          {tc("close")}
        </button>
      </div>
      <label className="grid gap-1 text-sm font-semibold text-fg-muted">
        {ts("galleryFilter")}
        <select value={event} onChange={(e) => setEvent(e.target.value)} className={fieldClass}>
          <option value="">{ts("allGalleries")}</option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title}
            </option>
          ))}
        </select>
      </label>
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (credit.trim() === applied) void load(null);
          else setApplied(credit.trim());
        }}
      >
        <label className="grid min-w-0 flex-1 gap-1 text-sm font-semibold text-fg-muted">
          {ts("cosplayerFilter")}
          <input value={credit} onChange={(e) => setCredit(e.target.value)} className={fieldClass} />
        </label>
        <button type="submit" className={secondaryClass}>
          {ts("applyFilter")}
        </button>
      </form>
      {state === "error" ? (
        <p role="alert" className="text-sm text-danger">
          {ts("photoLoadError")}{" "}
          <button type="button" onClick={() => void load(null)} className="underline underline-offset-4">
            {ts("retry")}
          </button>
        </p>
      ) : state === "ready" && items.length === 0 ? (
        <p className="text-sm text-fg-subtle">{ts("noPhotoMatches")}</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2">
          {items.map((photo) => {
            const place = chosen.indexOf(photo.id);
            return (
              <li key={photo.id}>
                <button
                  type="button"
                  aria-pressed={place >= 0}
                  aria-label={`${photo.eventTitle} · ${photo.creditNames.join(" / ") || ts("missingCn")}`}
                  disabled={place < 0 && chosen.length >= max}
                  onClick={() => (place >= 0 ? studio.removePhoto(photo.id) : studio.addPhoto(photo))}
                  className={`relative block w-full border-2 transition disabled:opacity-40 ${place >= 0 ? "border-accent" : "border-transparent hover:border-fg-subtle"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.thumbUrl} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                  {place >= 0 && <span className="font-meta absolute right-1 top-1 bg-accent px-1.5 text-xs font-semibold text-accent-fg">{place + 1}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {state === "loading" && (
        <p role="status" className="text-sm text-fg-subtle">
          {ts("loadingPhotos")}
        </p>
      )}
      {cursor && state === "ready" && (
        <button type="button" onClick={() => void load(cursor)} className={secondaryClass}>
          {ts("loadMore")}
        </button>
      )}
    </section>
  );
}
