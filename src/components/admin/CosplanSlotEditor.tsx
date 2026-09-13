"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import Button, { buttonClasses } from "@/components/ui/Button";
import { controlClasses } from "@/components/ui/Field";
import {
  COSPLAN_SLOT_LIMIT,
  type CosplanDetectionPreset,
  type CosplanSlot,
  type CosplanSlotCandidate
} from "@/lib/cosplanTypes";

type Labels = {
  title: string;
  hint: string;
  add: string;
  save: string;
  saving: string;
  saved: string;
  error: string;
  empty: string;
  nameEn: string;
  nameZh: string;
  remove: string;
  foreground: string;
  foregroundHint: string;
  uploadForeground: string;
  removeForeground: string;
  foregroundActive: string;
  detect: string;
  detecting: string;
  detectionTitle: string;
  detectionHint: string;
  advancedDetection: string;
  preset: string;
  strict: string;
  standard: string;
  loose: string;
  inset: string;
  insetHint: string;
  candidatesFound: string;
  noCandidates: string;
  recommended: string;
  review: string;
  applyCandidates: string;
  replaceCandidates: string;
  replaceConfirm: string;
  detectionError: string;
  detectionBusy: string;
  detectionTimeout: string;
  detectionStale: string;
  preview: string;
  expandPreview: string;
  collapsePreview: string;
  rectangularShape: string;
  irregularShape: string;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

function intersectionOverUnion(a: Pick<CosplanSlot, "x" | "y" | "width" | "height">, b: Pick<CosplanSlot, "x" | "y" | "width" | "height">) {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  return intersection ? intersection / (a.width * a.height + b.width * b.height - intersection) : 0;
}

function normalizedShapePath(slot: Pick<CosplanSlot, "shape">) {
  return slot.shape?.contours.map((contour) => contour.map((point, index) => `${index ? "L" : "M"}${point.x} ${point.y}`).join(" ") + " Z").join(" ") ?? "M0 0 H1 V1 H0 Z";
}

function shapeClipPath(slot: Pick<CosplanSlot, "shape">) {
  const contour = slot.shape?.contours[0];
  return contour ? `polygon(${contour.map((point) => `${point.x * 100}% ${point.y * 100}%`).join(",")})` : undefined;
}

export default function CosplanSlotEditor({
  template,
  labels
}: {
  template: {
    id: string;
    assetToken: string;
    layoutVersion: number;
    imageUrl: string;
    width: number;
    height: number;
    foregroundUrl: string | null;
    slots: CosplanSlot[];
  };
  labels: Labels;
}) {
  const router = useRouter();
  const previewRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; id: string; x: number; y: number; clientX: number; clientY: number } | null>(null);
  const [slots, setSlots] = useState(template.slots);
  const [selectedId, setSelectedId] = useState<string | null>(template.slots[0]?.id ?? null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [foregroundStatus, setForegroundStatus] = useState<"idle" | "saving" | "error">("idle");
  const [detectionPreset, setDetectionPreset] = useState<CosplanDetectionPreset>("standard");
  const [detectionInset, setDetectionInset] = useState(4);
  const [detectionStatus, setDetectionStatus] = useState<"idle" | "detecting" | "results" | "error">("idle");
  const [detectionError, setDetectionError] = useState("");
  const [candidates, setCandidates] = useState<CosplanSlotCandidate[]>([]);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(new Set());
  const [mobilePreviewExpanded, setMobilePreviewExpanded] = useState(true);
  const detectionRequest = useRef(0);
  const selected = slots.find((slot) => slot.id === selectedId) ?? null;

  useEffect(() => {
    detectionRequest.current += 1;
    setCandidates([]);
    setSelectedCandidateIds(new Set());
    setDetectionStatus("idle");
    setDetectionError("");
  }, [template.assetToken, template.layoutVersion]);

  function clearDetectionResults() {
    detectionRequest.current += 1;
    setCandidates([]);
    setSelectedCandidateIds(new Set());
    setDetectionStatus("idle");
    setDetectionError("");
  }

  function updateSlot(id: string, patch: Partial<CosplanSlot>) {
    setStatus("idle");
    setSlots((items) => items.map((slot) => {
      if (slot.id !== id) return slot;
      const next = { ...slot, ...patch };
      next.width = clamp(next.width, 24, template.width - next.x);
      next.height = clamp(next.height, 24, template.height - next.y);
      next.x = clamp(next.x, 0, template.width - next.width);
      next.y = clamp(next.y, 0, template.height - next.height);
      return next;
    }));
  }

  function addSlot() {
    if (slots.length >= COSPLAN_SLOT_LIMIT) return;
    const width = Math.max(120, Math.round(template.width * 0.26));
    const height = Math.max(160, Math.round(template.height * 0.52));
    const offset = Math.round(template.width * 0.03 * slots.length);
    const id = `slot-${Date.now().toString(36)}`;
    const slot: CosplanSlot = {
      id,
      nameEn: `Slot ${slots.length + 1}`,
      nameZh: `槽位 ${slots.length + 1}`,
      x: clamp(Math.round(template.width * 0.08) + offset, 0, template.width - width),
      y: clamp(Math.round(template.height * 0.28) + offset, 0, template.height - height),
      width,
      height
    };
    setSlots((items) => [...items, slot]);
    setSelectedId(id);
    setStatus("idle");
  }

  function removeSlot(id: string) {
    setSlots((items) => items.filter((slot) => slot.id !== id));
    setSelectedId((current) => current === id ? null : current);
    setStatus("idle");
  }

  async function saveSlots() {
    setStatus("saving");
    const response = await fetch(`/api/admin/cosplan-templates/${template.id}/layout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slots })
    }).catch(() => null);
    if (!response?.ok) return setStatus("error");
    setStatus("saved");
    router.refresh();
  }

  async function detectSlots() {
    const requestId = ++detectionRequest.current;
    setDetectionStatus("detecting");
    setDetectionError("");
    const response = await fetch(`/api/admin/cosplan-templates/${template.id}/detect-slots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        preset: detectionPreset,
        inset: detectionInset,
        assetToken: template.assetToken,
        layoutVersion: template.layoutVersion
      })
    }).catch(() => null);
    if (requestId !== detectionRequest.current) return;
    const payload = await response?.json().catch(() => null) as {
      error?: string;
      candidates?: CosplanSlotCandidate[];
      assetToken?: string;
      layoutVersion?: number;
    } | null;
    if (
      !response?.ok ||
      payload?.assetToken !== template.assetToken ||
      payload?.layoutVersion !== template.layoutVersion ||
      !Array.isArray(payload.candidates)
    ) {
      const error = payload?.error ?? "detectionFailed";
      setDetectionError(error);
      setDetectionStatus("error");
      return;
    }
    setCandidates(payload.candidates);
    setSelectedCandidateIds(new Set(
      payload.candidates.filter((candidate) => candidate.quality === "recommended").map((candidate) => candidate.id)
    ));
    setDetectionStatus("results");
  }

  function applyDetectedCandidates(replace: boolean) {
    const chosen = candidates.filter((candidate) => selectedCandidateIds.has(candidate.id));
    if (!chosen.length) return;
    if (replace && slots.length && !window.confirm(labels.replaceConfirm)) return;
    const base = replace ? [] : [...slots];
    const additions = chosen
      .filter((candidate) => !base.some((slot) => intersectionOverUnion(candidate, slot) > 0.82))
      .slice(0, Math.max(0, COSPLAN_SLOT_LIMIT - base.length))
      .map((candidate, index): CosplanSlot => {
        const number = base.length + index + 1;
        return {
          id: `slot-${crypto.randomUUID()}`,
          nameEn: `Slot ${number}`,
          nameZh: `槽位 ${number}`,
          x: candidate.x,
          y: candidate.y,
          width: candidate.width,
          height: candidate.height,
          ...(candidate.shape ? { shape: structuredClone(candidate.shape) } : {})
        };
      });
    const next = [...base, ...additions];
    setSlots(next);
    setSelectedId(additions.at(-1)?.id ?? next.at(-1)?.id ?? null);
    setCandidates([]);
    setSelectedCandidateIds(new Set());
    setDetectionStatus("idle");
    setStatus("idle");
  }

  async function uploadForeground(file: File) {
    setForegroundStatus("saving");
    const body = new FormData();
    body.set("file", file);
    const response = await fetch(`/api/admin/cosplan-templates/${template.id}/foreground`, {
      method: "POST",
      body
    }).catch(() => null);
    if (!response?.ok) return setForegroundStatus("error");
    setForegroundStatus("idle");
    router.refresh();
  }

  async function removeForeground() {
    setForegroundStatus("saving");
    const response = await fetch(`/api/admin/cosplan-templates/${template.id}/foreground`, {
      method: "DELETE"
    }).catch(() => null);
    if (!response?.ok) return setForegroundStatus("error");
    setForegroundStatus("idle");
    router.refresh();
  }

  const selectedCandidateCount = candidates.filter((candidate) => selectedCandidateIds.has(candidate.id)).length;
  const detectionErrorLabel = detectionError === "busy"
    ? labels.detectionBusy
    : detectionError === "timeout"
      ? labels.detectionTimeout
      : detectionError === "staleTemplate"
        ? labels.detectionStale
        : labels.detectionError;

  return (
    <div className={`grid gap-5 ${mobilePreviewExpanded ? "pb-[23rem]" : "pb-20"} xl:grid-cols-[minmax(20rem,28rem)_minmax(0,1fr)] xl:items-start xl:pb-0`}>
      <div className="flex flex-wrap items-start justify-between gap-3 xl:col-start-1">
        <div>
          <h4 className="font-display text-lg font-semibold">{labels.title}</h4>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-fg-subtle">{labels.hint}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="compact" onClick={() => void detectSlots()} disabled={detectionStatus === "detecting"}>
            {detectionStatus === "detecting" ? labels.detecting : labels.detect}
          </Button>
          <Button size="compact" onClick={addSlot} disabled={slots.length >= COSPLAN_SLOT_LIMIT}>{labels.add}</Button>
        </div>
      </div>
      <p className="-mt-3 max-w-3xl text-sm leading-6 text-fg-subtle xl:col-start-1">{labels.detectionHint}</p>

      <details className="rounded-xl border border-border bg-surface-2 px-4 xl:col-start-1">
        <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-fg-muted">{labels.advancedDetection}</summary>
        <div className="grid gap-4 border-t border-border py-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <fieldset>
            <legend className="text-sm font-semibold text-fg-muted">{labels.preset}</legend>
            <div className="mt-2 grid grid-cols-3 rounded-lg bg-control p-1">
              {(["strict", "standard", "loose"] as const).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  aria-pressed={detectionPreset === preset}
                  onClick={() => {
                    setDetectionPreset(preset);
                    clearDetectionResults();
                  }}
                  className={`min-h-11 rounded-md px-2 text-sm font-semibold transition-colors ${detectionPreset === preset ? "bg-raised text-fg shadow-sm" : "text-fg-subtle hover:text-fg"}`}
                >
                  {labels[preset]}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="text-sm font-semibold text-fg-muted">
            {labels.inset}
            <input
              type="number"
              min="0"
              max="64"
              value={detectionInset}
              onChange={(event) => {
                setDetectionInset(clamp(Number(event.target.value), 0, 64));
                clearDetectionResults();
              }}
              className={`${controlClasses} mt-2`}
            />
          </label>
          <p className="text-sm leading-6 text-fg-subtle sm:col-span-2">{labels.insetHint}</p>
        </div>
      </details>

      <p role={detectionStatus === "error" ? "alert" : "status"} className={`min-h-5 text-sm xl:col-start-1 ${detectionStatus === "error" ? "text-danger" : "text-fg-subtle"}`}>
        {detectionStatus === "error" ? detectionErrorLabel : detectionStatus === "results" && candidates.length === 0 ? labels.noCandidates : ""}
      </p>

      <div className="contents">
        <div className="fixed bottom-4 right-4 z-40 w-[min(16rem,calc(100vw-2rem))] rounded-xl border border-border-strong bg-raised p-3 shadow-[0_16px_48px_rgb(0_0_0/0.28)] xl:sticky xl:top-4 xl:col-start-2 xl:row-start-1 xl:w-auto xl:self-start xl:border-0 xl:bg-transparent xl:p-0 xl:shadow-none">
        <div className="flex min-h-11 items-center justify-between gap-2 xl:hidden">
          <div className="min-w-0"><p className="font-meta text-[0.625rem] font-semibold tracking-[0.14em] text-accent-text">PREVIEW</p><p className="truncate text-sm font-semibold">{labels.preview}</p></div>
          <Button size="compact" variant="ghost" className="size-11 shrink-0 px-0" aria-label={mobilePreviewExpanded ? labels.collapsePreview : labels.expandPreview} aria-expanded={mobilePreviewExpanded} onClick={() => setMobilePreviewExpanded((expanded) => !expanded)}>
            <svg aria-hidden="true" viewBox="0 0 24 24" className={`size-4 transition-transform duration-150 motion-reduce:transition-none ${mobilePreviewExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m7 10 5 5 5-5" /></svg>
          </Button>
        </div>
        <div className={`${mobilePreviewExpanded ? "block" : "hidden"} xl:block`}>
        <div className="rounded-xl bg-control p-3">
          <div
            ref={previewRef}
            className="relative mx-auto w-full max-w-2xl touch-none overflow-hidden rounded-lg bg-white"
            style={{ aspectRatio: `${template.width} / ${template.height}` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={template.imageUrl} alt="" className="absolute inset-0 size-full object-fill" draggable={false} />
            {slots.map((slot, index) => (
              <button
                key={slot.id}
                type="button"
                aria-label={`${slot.nameZh} / ${slot.nameEn}`}
                onClick={() => setSelectedId(slot.id)}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  dragRef.current = { pointerId: event.pointerId, id: slot.id, x: slot.x, y: slot.y, clientX: event.clientX, clientY: event.clientY };
                  setSelectedId(slot.id);
                }}
                onPointerMove={(event) => {
                  const drag = dragRef.current;
                  const preview = previewRef.current;
                  if (!drag || drag.pointerId !== event.pointerId || drag.id !== slot.id || !preview) return;
                  const scale = template.width / preview.getBoundingClientRect().width;
                  updateSlot(slot.id, { x: drag.x + (event.clientX - drag.clientX) * scale, y: drag.y + (event.clientY - drag.clientY) * scale });
                }}
                onPointerUp={() => { dragRef.current = null; }}
                onPointerCancel={() => { dragRef.current = null; }}
                className={`absolute flex items-start justify-start p-2 text-left transition-[background-color,border-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${slot.shape ? "border-0 bg-transparent" : selectedId === slot.id ? "border-2 border-accent bg-accent/22" : "border-2 border-white/90 bg-black/18"}`}
                style={{
                  left: `${slot.x / template.width * 100}%`,
                  top: `${slot.y / template.height * 100}%`,
                  width: `${slot.width / template.width * 100}%`,
                  height: `${slot.height / template.height * 100}%`,
                  clipPath: shapeClipPath(slot)
                }}
              >
                {slot.shape && <svg aria-hidden="true" viewBox="0 0 1 1" preserveAspectRatio="none" className={`absolute inset-0 size-full ${selectedId === slot.id ? "text-accent" : "text-white"}`}><path d={normalizedShapePath(slot)} fill="currentColor" fillOpacity="0.2" fillRule="evenodd" stroke="currentColor" strokeWidth="0.01" vectorEffect="non-scaling-stroke" /></svg>}
                <span className="font-meta relative rounded bg-black/72 px-2 py-1 text-[0.625rem] font-semibold text-white">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </button>
            ))}
            {candidates.map((candidate, index) => {
              const checked = selectedCandidateIds.has(candidate.id);
              return (
                <button
                  key={candidate.id}
                  type="button"
                  aria-pressed={checked}
                  aria-label={`${labels.detectionTitle} ${index + 1}`}
                  onClick={() => setSelectedCandidateIds((current) => {
                    const next = new Set(current);
                    if (next.has(candidate.id)) next.delete(candidate.id);
                    else next.add(candidate.id);
                    return next;
                  })}
                  className={`absolute flex items-start justify-end p-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${candidate.shape ? "border-0 bg-transparent" : checked ? "border-2 border-dashed border-accent bg-accent/20" : "border-2 border-dashed border-warning-border bg-warning-surface"}`}
                  style={{
                    left: `${candidate.x / template.width * 100}%`,
                    top: `${candidate.y / template.height * 100}%`,
                    width: `${candidate.width / template.width * 100}%`,
                    height: `${candidate.height / template.height * 100}%`,
                    clipPath: shapeClipPath(candidate)
                  }}
                >
                  {candidate.shape && <svg aria-hidden="true" viewBox="0 0 1 1" preserveAspectRatio="none" className={checked ? "absolute inset-0 size-full text-accent" : "absolute inset-0 size-full text-warning"}><path d={normalizedShapePath(candidate)} fill="currentColor" fillOpacity="0.18" fillRule="evenodd" stroke="currentColor" strokeDasharray="0.025 0.018" strokeWidth="0.01" /></svg>}
                  <span className="font-meta relative rounded bg-black/75 px-2 py-1 text-[0.625rem] font-semibold text-white">A{String(index + 1).padStart(2, "0")}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      </div>

        <div className="flex flex-col gap-4 xl:col-start-1">
        {selected ? (
          <div className="rounded-xl border border-border bg-surface-2 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="font-meta text-xs text-accent-text">{selected.id} · {selected.shape ? labels.irregularShape : labels.rectangularShape}</span>
              <Button size="compact" variant="danger" onClick={() => removeSlot(selected.id)}>{labels.remove}</Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="col-span-2 text-sm font-semibold text-fg-muted">{labels.nameEn}<input className={`${controlClasses} mt-1`} value={selected.nameEn} onChange={(event) => updateSlot(selected.id, { nameEn: event.target.value })} maxLength={60} /></label>
              <label className="col-span-2 text-sm font-semibold text-fg-muted">{labels.nameZh}<input className={`${controlClasses} mt-1`} value={selected.nameZh} onChange={(event) => updateSlot(selected.id, { nameZh: event.target.value })} maxLength={60} /></label>
              {(["x", "y", "width", "height"] as const).map((field) => (
                <label key={field} className="text-sm font-semibold uppercase text-fg-muted">{field}<input className={`${controlClasses} mt-1`} type="number" value={selected[field]} onChange={(event) => updateSlot(selected.id, { [field]: Number(event.target.value) })} /></label>
              ))}
            </div>
          </div>
        ) : <p className="rounded-xl border border-border bg-surface-2 p-4 text-sm text-fg-subtle">{labels.empty}</p>}
        <Button variant="primary" onClick={() => void saveSlots()} disabled={status === "saving"}>{status === "saving" ? labels.saving : labels.save}</Button>
        <p role="status" className={`min-h-5 text-sm ${status === "error" ? "text-danger" : "text-fg-subtle"}`}>{status === "saved" ? labels.saved : status === "error" ? labels.error : ""}</p>

        <div className="border-t border-border pt-4">
          <h4 className="font-display text-lg font-semibold">{labels.foreground}</h4>
          <p className="mt-1 text-sm leading-6 text-fg-subtle">{labels.foregroundHint}</p>
          {template.foregroundUrl && <p className="font-meta mt-2 text-xs text-success-strong">{labels.foregroundActive}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <label className={buttonClasses({ size: "compact", className: "cursor-pointer" })}>
              <input type="file" accept="image/png,image/webp" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadForeground(file); event.currentTarget.value = ""; }} />
              {foregroundStatus === "saving" ? labels.saving : labels.uploadForeground}
            </label>
            {template.foregroundUrl && <Button size="compact" variant="ghost" onClick={() => void removeForeground()} disabled={foregroundStatus === "saving"}>{labels.removeForeground}</Button>}
          </div>
          {foregroundStatus === "error" && <p role="alert" className="mt-2 text-sm text-danger">{labels.error}</p>}
        </div>
        </div>
      </div>

      {detectionStatus === "results" && candidates.length > 0 && (
        <section className="rounded-xl border border-border bg-surface-2 p-4 xl:col-start-1" aria-labelledby={`cosplan-candidates-${template.id}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h5 id={`cosplan-candidates-${template.id}`} className="font-display text-lg font-semibold">{labels.detectionTitle}</h5>
              <p className="mt-1 text-sm text-fg-subtle">{candidates.length} {labels.candidatesFound}</p>
            </div>
            <span className="font-meta text-xs text-accent-text">{selectedCandidateCount} / {candidates.length}</span>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {candidates.map((candidate, index) => {
              const checked = selectedCandidateIds.has(candidate.id);
              return (
                <label key={candidate.id} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 ${checked ? "border-accent bg-accent-surface" : "border-border bg-surface"}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => setSelectedCandidateIds((current) => {
                      const next = new Set(current);
                      if (next.has(candidate.id)) next.delete(candidate.id);
                      else next.add(candidate.id);
                      return next;
                    })}
                  />
                  <span className="font-meta text-xs text-accent-text">A{String(index + 1).padStart(2, "0")}</span>
                  <span className="min-w-0 flex-1 text-sm font-semibold">{candidate.width} × {candidate.height}<span className="ml-2 text-xs font-medium text-fg-subtle">{candidate.shape ? labels.irregularShape : labels.rectangularShape}</span></span>
                  <span className={`text-xs font-semibold ${candidate.quality === "recommended" ? "text-success-strong" : "text-warning"}`}>
                    {candidate.quality === "recommended" ? labels.recommended : labels.review}
                  </span>
                </label>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => applyDetectedCandidates(false)} disabled={!selectedCandidateCount || slots.length >= COSPLAN_SLOT_LIMIT}>{labels.applyCandidates}</Button>
            {slots.length > 0 && <Button variant="danger" onClick={() => applyDetectedCandidates(true)} disabled={!selectedCandidateCount}>{labels.replaceCandidates}</Button>}
          </div>
        </section>
      )}
    </div>
  );
}
