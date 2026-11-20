"use client";

import { useEffect, useRef, useState, type TouchEvent } from "react";
import { useTranslations } from "next-intl";
import { pad } from "../hud";
import { secondaryClass, StepButtons } from "../booking/shared";
import type { StudioPhoto } from "./types";

/**
 * Portrait-mobile replacement for the 3D Light Table on Studio's Photos screen:
 * a large swipeable Hero Loupe, a scrollable thumbnail filmstrip with status
 * badges, and a full-screen lightbox for checking fine detail before starring
 * or featuring a photo.
 */
export default function PhotosPhoneLoupe({
  photos,
  focus,
  picked,
  status,
  busy,
  onFocus,
  onStep,
  onTogglePick,
  onCover,
  onHighlight
}: {
  photos: StudioPhoto[];
  focus: number;
  picked: string[];
  status: (string | false)[];
  busy: boolean;
  onFocus: (index: number) => void;
  onStep: (delta: number) => void;
  onTogglePick: () => void;
  onCover: () => void;
  onHighlight: () => void;
}) {
  const t = useTranslations("album3d");
  const ta = useTranslations("adminEvents");
  const tc = useTranslations("common");
  const [lightbox, setLightbox] = useState(false);
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const photo = photos[focus];

  useEffect(() => {
    stripRef.current?.querySelector<HTMLElement>("[data-active='true']")?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [focus]);

  useEffect(() => {
    if (!photo) setLightbox(false);
  }, [photo]);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setLightbox(false);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        onStep(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        onStep(1);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [lightbox, onStep]);

  if (!photo) return null;

  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    swipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: TouchEvent) => {
    const start = swipeRef.current;
    swipeRef.current = null;
    if (!start || e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.2) onStep(dx < 0 ? 1 : -1);
  };

  return (
    <>
      <div className="grid gap-2.5">
        <div
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          className="relative flex h-[38dvh] min-h-[220px] max-h-[420px] w-full items-center justify-center overflow-hidden border border-border-strong bg-control/80"
        >
          <button type="button" onClick={() => setLightbox(true)} aria-label={t("photoExpand")} className="flex h-full w-full items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.med} alt={photo.name} className="h-full w-full object-contain" />
          </button>
          {status.length > 0 && (
            <p className="font-meta pointer-events-none absolute left-2 top-2 bg-page/90 px-2 py-1 text-[0.625rem] font-semibold uppercase tracking-[0.1em] text-accent-text">
              {status.join(" · ")}
            </p>
          )}
          <button
            type="button"
            onClick={() => setLightbox(true)}
            aria-label={t("photoExpand")}
            className="absolute right-2 top-2 grid h-9 w-9 place-items-center border border-border-strong bg-page/90 text-sm text-fg"
          >
            ⤢
          </button>
        </div>
        {photos.length > 1 && (
          <div ref={stripRef} role="region" aria-label={t("filmstripLabel")} className="flex gap-1.5 overflow-x-auto py-1">
            {photos.map((item, i) => {
              const active = i === focus;
              const isPicked = picked.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  data-active={active ? "true" : undefined}
                  aria-current={active ? "true" : undefined}
                  aria-label={`${i + 1} / ${photos.length} ${item.name}`}
                  onClick={() => onFocus(i)}
                  className={`relative h-14 w-14 shrink-0 overflow-hidden bg-control ${active ? "ring-2 ring-fg ring-offset-1 ring-offset-page" : "opacity-75"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.thumb} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                  {item.cover && (
                    <span aria-hidden="true" className="absolute left-0.5 top-0.5 bg-page/90 px-1 text-[0.625rem] leading-tight text-fg">
                      ★
                    </span>
                  )}
                  {item.highlight && (
                    <span aria-hidden="true" className="absolute bottom-1 left-1 h-2 w-2 rounded-full bg-accent ring-1 ring-page" />
                  )}
                  {isPicked && (
                    <span aria-hidden="true" className="absolute right-0.5 top-0.5 bg-accent px-1 text-[0.625rem] font-bold leading-tight text-page">
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{photo.name}</p>
            <p className="truncate text-xs text-fg-muted">{photo.credit ? [photo.credit, photo.subject].filter(Boolean).join(" · ") : ta("photoNoCredits")}</p>
          </div>
          <label className="flex min-h-10 shrink-0 items-center gap-2 border border-border-strong px-2.5 text-xs font-semibold">
            <input type="checkbox" checked={picked.includes(photo.id)} onChange={onTogglePick} className="h-4 w-4 accent-[var(--color-accent)]" />
            {t("studioPick")}
          </label>
        </div>
      </div>

      {lightbox && (
        <div role="dialog" aria-modal="true" aria-label={photo.name} className="fixed inset-0 z-40 flex flex-col bg-page">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
            <p className="font-meta min-w-0 truncate text-xs uppercase tracking-[0.12em] text-fg-subtle">
              <span className="text-fg">{pad(focus + 1)}</span> / {pad(photos.length)} · {photo.name}
            </p>
            <button type="button" onClick={() => setLightbox(false)} aria-label={tc("close")} className="grid h-11 w-11 shrink-0 place-items-center text-xl">
              ×
            </button>
          </div>
          <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} className="flex min-h-0 flex-1 items-center justify-center p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.med} alt={photo.name} className="max-h-full max-w-full object-contain" />
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-2.5">
            {photos.length > 1 && <StepButtons onStep={onStep} atStart={focus === 0} atEnd={focus >= photos.length - 1} />}
            <button type="button" disabled={busy || photo.cover || !photo.visible} onClick={onCover} className={`${secondaryClass} ml-auto px-3 text-xs`}>
              {photo.cover ? ta("cover") : ta("setCover")}
            </button>
            <button type="button" disabled={busy || !photo.visible} onClick={onHighlight} className={`${secondaryClass} px-3 text-xs`}>
              {photo.highlight ? ta("removeHomeHighlight") : ta("addHomeHighlight")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
