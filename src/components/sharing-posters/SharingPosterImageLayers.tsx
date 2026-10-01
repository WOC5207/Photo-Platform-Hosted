"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Button from "@/components/ui/Button";
import RangeField from "@/components/sharing-posters/PosterRangeField";
import {
  SHARING_POSTER_LAYER_MAX_SCALE,
  SHARING_POSTER_MAX_LAYERS,
  coverSharingPosterLayerScale,
  sharingPosterLayerUrl,
  type SharingPosterLayer
} from "@/lib/sharingPoster";

async function uploadLayer(file: File): Promise<{ token: string; width: number; height: number }> {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch("/api/dashboard/sharing-posters/layers", { method: "POST", body });
  const result = (await response.json().catch(() => null)) as { error?: string; token?: string; width?: number; height?: number } | null;
  if (!response.ok || !result?.token || !result.width || !result.height) throw new Error(result?.error || "unknown");
  return { token: result.token, width: result.width, height: result.height };
}

function newLayerId(layers: SharingPosterLayer[]): string {
  for (let index = layers.length + 1; ; index += 1) {
    const id = `layer-${index}`;
    if (!layers.some((layer) => layer.id === id)) return id;
  }
}

/**
 * Images the owner uploads and places on the poster: a logo, a watermark, a
 * texture. Each sits in front of everything or behind the photographs, and is
 * moved by dragging it in the preview.
 */
export default function SharingPosterImageLayers({
  layers,
  ratio,
  selectedLayerId,
  onSelect,
  onChange
}: {
  layers: SharingPosterLayer[];
  ratio: { width: number; height: number };
  selectedLayerId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (update: (layers: SharingPosterLayer[]) => SharingPosterLayer[]) => void;
}) {
  const t = useTranslations("sharingPosters");
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selected = layers.find((layer) => layer.id === selectedLayerId) ?? null;

  async function add(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const uploaded = await uploadLayer(file);
      const id = newLayerId(layers);
      onChange((current) =>
        current.length >= SHARING_POSTER_MAX_LAYERS || current.some((layer) => layer.id === id)
          ? current
          : [...current, { id, ...uploaded, x: 0.5, y: 0.5, scale: 0.3, opacity: 1, placement: "front" }]
      );
      onSelect(id);
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "unknown";
      setError(t(code === "tooLarge" ? "layerTooLarge" : code === "quotaExceeded" ? "layerQuota" : "layerUploadError"));
    } finally {
      setBusy(false);
    }
  }

  function update(id: string, change: Partial<SharingPosterLayer>) {
    onChange((current) => current.map((layer) => (layer.id === id ? { ...layer, ...change } : layer)));
  }

  return (
    <div className="mt-6 grid gap-3 border-t border-border pt-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{t("imageLayers")}</h3>
          <p className="mt-1 text-sm leading-6 text-fg-subtle">{t("imageLayersHint")}</p>
        </div>
        <Button size="compact" disabled={busy || layers.length >= SHARING_POSTER_MAX_LAYERS} onClick={() => inputRef.current?.click()}>
          {busy ? t("layerUploading") : t("addImageLayer")}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/webp,image/jpeg"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.currentTarget.value = "";
            void add(file);
          }}
        />
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {layers.length > 0 && (
        <ul className="grid gap-2">
          {layers.map((layer, index) => {
            const active = layer.id === selectedLayerId;
            return (
              <li key={layer.id}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSelect(active ? null : layer.id)}
                  className={`flex min-h-11 w-full items-center gap-3 rounded-lg border px-2 py-1.5 text-left text-sm font-semibold ${active ? "border-accent bg-accent-surface text-accent-strong" : "border-border-strong bg-raised text-fg-muted"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={sharingPosterLayerUrl(layer.token)} alt="" className="h-9 w-9 shrink-0 rounded bg-[repeating-conic-gradient(#ddd_0_25%,#fff_0_50%)] bg-[length:10px_10px] object-contain" />
                  <span className="min-w-0 flex-1 truncate">{t("imageLayerName", { number: index + 1 })}</span>
                  <span className="font-meta text-xs text-fg-subtle">{t(layer.placement === "front" ? "layerFront" : "layerBack")}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {selected && (
        <div className="grid gap-4 rounded-lg border border-border bg-raised p-3">
          <div role="group" aria-label={t("layerPlacement")} className="grid grid-cols-2 gap-2">
            {(["front", "back"] as const).map((placement) => (
              <button
                key={placement}
                type="button"
                aria-pressed={selected.placement === placement}
                onClick={() => update(selected.id, { placement })}
                className={`min-h-11 rounded-lg border px-2 text-sm font-semibold ${selected.placement === placement ? "border-accent bg-accent-surface text-accent-strong" : "border-border-strong bg-raised text-fg-muted"}`}
              >
                {t(placement === "front" ? "layerFront" : "layerBack")}
              </button>
            ))}
          </div>
          <RangeField label={t("layerSize")} value={Math.round(selected.scale * 100)} min={2} max={SHARING_POSTER_LAYER_MAX_SCALE * 100} step={1} suffix="%" onChange={(value) => update(selected.id, { scale: value / 100 })} />
          <RangeField label={t("layerOpacity")} value={Math.round(selected.opacity * 100)} min={0} max={100} step={5} suffix="%" onChange={(value) => update(selected.id, { opacity: value / 100 })} />
          <p className="text-sm leading-6 text-fg-subtle">{t("layerDragHint")}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="compact" onClick={() => update(selected.id, { x: 0.5, y: 0.5 })}>{t("layerCentre")}</Button>
            <Button size="compact" onClick={() => update(selected.id, { x: 0.5, y: 0.5, scale: coverSharingPosterLayerScale(selected, ratio) })}>{t("layerCover")}</Button>
            <Button size="compact" onClick={() => { onChange((current) => current.filter((layer) => layer.id !== selected.id)); onSelect(null); }}>{t("layerRemove")}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
