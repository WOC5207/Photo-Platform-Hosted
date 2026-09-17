"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useRouter } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import Button, { buttonClasses } from "@/components/ui/Button";
import {
  SHARING_POSTER_GLASS_DEFAULTS,
  legacyTextGapPercent,
  sharingPosterMetadataFromPhotos,
  sharingPosterPixelSize,
  type SharingPosterComposition,
  type SharingPosterPhotoValue,
  type SharingPosterResolvedPhoto
} from "@/lib/sharingPoster";
import type { SharingPosterRenderResult } from "@/lib/sharingPosterCanvas";
import { legacyFocalToAnchor } from "@/lib/sharingPosterLayout";

const SharingPosterCanvas = dynamic(
  () => import("@/components/sharing-posters/SharingPosterCanvas"),
  { ssr: false, loading: () => <div className="aspect-[4/5] w-full max-w-xl animate-pulse bg-control" /> }
);
const SharingPosterPhotoPicker = dynamic(
  () => import("@/components/sharing-posters/SharingPosterPhotoPicker"),
  { ssr: false }
);

type EditorTab = "photos" | "layout" | "credits";
type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict";

const fieldClasses =
  "min-h-11 w-full rounded-lg border border-border-strong bg-control px-3 py-2 text-base text-fg outline-none transition-[border-color,box-shadow] focus:border-accent focus:ring-2 focus:ring-accent/20 sm:text-sm";
const ratioPresets = [
  [1, 1, "1:1"],
  [4, 5, "4:5"],
  [9, 16, "9:16"],
  [16, 9, "16:9"],
  [18, 9, "18:9"],
  [4, 3, "4:3"]
] as const;

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("encode_failed"))), type, quality);
  });
}

function safeFilename(value: string): string {
  return value.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").slice(0, 80) || "sharing-poster";
}

export default function SharingPosterEditor({
  project,
  initialPhotos,
  events
}: {
  project: { id: string; name: string; revision: number; composition: SharingPosterComposition };
  initialPhotos: SharingPosterResolvedPhoto[];
  events: { id: string; title: string }[];
}) {
  const t = useTranslations("sharingPosters");
  const locale = useLocale();
  const router = useRouter();
  const [name, setName] = useState(project.name);
  const [composition, setComposition] = useState(project.composition);
  const [sourceMap, setSourceMap] = useState<Map<string, SharingPosterPhotoValue | null>>(
    () => new Map(initialPhotos.map((photo) => [photo.photoId, photo.source]))
  );
  const [activeTab, setActiveTab] = useState<EditorTab>("photos");
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(
    project.composition.photos[0]?.photoId ?? null
  );
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveCycle, setSaveCycle] = useState(0);
  const [metrics, setMetrics] = useState<SharingPosterRenderResult>({ rectangles: [], footerTooTall: false, wrappedLineCount: 0 });
  const [exportState, setExportState] = useState<"idle" | "preparing" | "ready" | "error">("idle");
  const [prepared, setPrepared] = useState<{ blob: Blob; url: string; filename: string; signature: string } | null>(null);
  const [notice, setNotice] = useState("");
  // Existing projects carry an intentional snapshot. Only a brand-new empty
  // project auto-prefills while its first selection is being assembled.
  const metadataEditedRef = useRef(project.composition.photos.length > 0);
  const revisionRef = useRef(project.revision);
  const savingRef = useRef(false);
  const lastSavedRef = useRef(JSON.stringify({ name: project.name, composition: project.composition }));
  const currentSignature = useMemo(() => JSON.stringify({ name, composition }), [name, composition]);
  const currentSignatureRef = useRef(currentSignature);
  currentSignatureRef.current = currentSignature;

  const photos = useMemo<SharingPosterResolvedPhoto[]>(
    () =>
      composition.photos.map((photo) => ({
        photoId: photo.photoId,
        composition: photo,
        source: sourceMap.get(photo.photoId) ?? null
      })),
    [composition.photos, sourceMap]
  );
  const selectedPhoto = photos.find((photo) => photo.photoId === selectedPhotoId) ?? null;
  const pixelSize = sharingPosterPixelSize(composition);
  const unresolved = photos.filter((photo) => !photo.source);
  const missingCn = photos.filter((photo) => photo.source && photo.source.creditNames.length === 0);
  const canExport =
    photos.length > 0 &&
    unresolved.length === 0 &&
    composition.credits.cosplayer.trim().length > 0 &&
    composition.credits.photographer.trim().length > 0 &&
    (missingCn.length === 0 || composition.credits.cosplayerReviewed) &&
    !metrics.footerTooTall;
  const nativeShareAvailable = useMemo(() => {
    if (!prepared || typeof navigator === "undefined" || typeof File === "undefined" || !navigator.share) return false;
    if (!navigator.canShare) return true;
    try {
      return navigator.canShare({
        files: [new File([prepared.blob], prepared.filename, { type: prepared.blob.type })]
      });
    } catch {
      return false;
    }
  }, [prepared]);

  // While any photo that follows its subject is still waiting for the server
  // to detect one, re-read the project's photo sources now and then. Only the
  // sources are merged, never the composition, so nothing the owner is editing
  // can be overwritten. Bounded, and it stops as soon as nothing is pending.
  const awaitingSubject = photos.some(
    (photo) => photo.composition.crop?.mode === "auto" && photo.source?.subjectState === "pending"
  );
  useEffect(() => {
    if (!awaitingSubject) return;
    let cancelled = false;
    let attempts = 0;
    const timer = window.setInterval(async () => {
      attempts += 1;
      if (attempts > 12) {
        window.clearInterval(timer);
        return;
      }
      try {
        const response = await fetch(`/api/dashboard/sharing-posters/${encodeURIComponent(project.id)}?locale=${locale}`, { cache: "no-store" });
        if (!response.ok || cancelled) return;
        const data = (await response.json()) as { photos: SharingPosterResolvedPhoto[] };
        if (cancelled) return;
        setSourceMap((current) => {
          const next = new Map(current);
          for (const photo of data.photos) if (photo.source) next.set(photo.photoId, photo.source);
          return next;
        });
      } catch {
        // A failed poll just waits for the next one.
      }
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [awaitingSubject, project.id, locale]);

  useEffect(() => {
    if (currentSignature === lastSavedRef.current) return;
    if (saveState === "conflict" || saveState === "error" || savingRef.current) return;
    setSaveState("dirty");
    if (!name.trim()) return;
    const timer = window.setTimeout(async () => {
      savingRef.current = true;
      setSaveState("saving");
      const snapshot = currentSignatureRef.current;
      try {
        const payload = JSON.parse(snapshot) as { name: string; composition: SharingPosterComposition };
        const response = await fetch(`/api/dashboard/sharing-posters/${encodeURIComponent(project.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, revision: revisionRef.current })
        });
        if (response.status === 409) {
          setSaveState("conflict");
          return;
        }
        if (!response.ok) throw new Error("save_failed");
        const result = (await response.json()) as { revision: number };
        revisionRef.current = result.revision;
        lastSavedRef.current = snapshot;
        setSaveState(currentSignatureRef.current === snapshot ? "saved" : "dirty");
      } catch {
        setSaveState("error");
      } finally {
        savingRef.current = false;
        if (currentSignatureRef.current !== lastSavedRef.current) setSaveCycle((value) => value + 1);
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [currentSignature, name, project.id, saveCycle, saveState]);

  useEffect(() => {
    if (!prepared || prepared.signature === currentSignature) return;
    URL.revokeObjectURL(prepared.url);
    setPrepared(null);
    setExportState("idle");
  }, [currentSignature, prepared]);

  useEffect(() => () => {
    if (prepared) URL.revokeObjectURL(prepared.url);
  }, [prepared]);

  const handleMetrics = useCallback((value: SharingPosterRenderResult) => {
    setMetrics((current) =>
      current.footerTooTall === value.footerTooTall && current.wrappedLineCount === value.wrappedLineCount
        ? current
        : value
    );
  }, []);

  function updatePhoto(id: string, update: (photo: SharingPosterComposition["photos"][number]) => SharingPosterComposition["photos"][number]) {
    setComposition((current) => ({
      ...current,
      photos: current.photos.map((photo) => (photo.photoId === id ? update(photo) : photo))
    }));
  }

  /** What the two focus inputs edit: the manual anchor, or the legacy focal fractions. */
  function cropValue(photo: SharingPosterResolvedPhoto): { x: number; y: number } {
    const crop = photo.composition.crop;
    if (crop?.mode === "manual") return { x: crop.x, y: crop.y };
    return { x: photo.composition.focalX, y: photo.composition.focalY };
  }

  function setCropAxis(photo: SharingPosterResolvedPhoto, axis: "x" | "y", value: number) {
    const clamped = Math.min(1, Math.max(0, value));
    updatePhoto(photo.photoId, (entry) =>
      entry.crop?.mode === "manual"
        ? { ...entry, crop: { ...entry.crop, [axis]: clamped } }
        : { ...entry, [axis === "x" ? "focalX" : "focalY"]: clamped }
    );
  }

  function setCropMode(photo: SharingPosterResolvedPhoto, mode: "auto" | "manual") {
    if (mode === "auto") {
      updatePhoto(photo.photoId, (entry) => ({ ...entry, crop: { mode: "auto" } }));
      return;
    }
    // Manual starts from whatever is showing now, so nothing jumps.
    const source = photo.source;
    const rect = metrics.rectangles.find((candidate) => candidate.id === photo.photoId);
    let anchor = { x: 0.5, y: 0.5 };
    if (photo.composition.crop?.mode === "auto") {
      if (source?.subject) anchor = { x: source.subject.x, y: source.subject.y };
    } else if (!photo.composition.crop && source && rect) {
      anchor = legacyFocalToAnchor(source.width, source.height, rect.width, rect.height, photo.composition.focalX, photo.composition.focalY);
    }
    updatePhoto(photo.photoId, (entry) => ({ ...entry, crop: { mode: "manual", x: anchor.x, y: anchor.y } }));
  }

  function syncMetadata(nextPhotos: SharingPosterResolvedPhoto[]) {
    if (metadataEditedRef.current) return;
    const available = nextPhotos.flatMap((photo) => (photo.source ? [photo.source] : []));
    const metadata = sharingPosterMetadataFromPhotos(available);
    setComposition((current) => ({
      ...current,
      credits: {
        ...current.credits,
        ...metadata,
        cosplayerReviewed: available.every((photo) => photo.creditNames.length > 0)
      }
    }));
  }

  function addPhoto(source: SharingPosterPhotoValue) {
    if (composition.photos.some((photo) => photo.photoId === source.id) || composition.photos.length >= 9) return;
    const entry = { photoId: source.id, weight: source.homeWeight, focalX: 0.5, focalY: 0.5, crop: { mode: "auto" as const } };
    setSourceMap((current) => new Map(current).set(source.id, source));
    const nextResolved = [...photos, { photoId: source.id, composition: entry, source }];
    setComposition((current) => ({ ...current, photos: [...current.photos, entry] }));
    setSelectedPhotoId(source.id);
    syncMetadata(nextResolved);
  }

  function removePhoto(id: string) {
    const next = photos.filter((photo) => photo.photoId !== id);
    setComposition((current) => ({ ...current, photos: current.photos.filter((photo) => photo.photoId !== id) }));
    if (selectedPhotoId === id) setSelectedPhotoId(next[0]?.photoId ?? null);
    syncMetadata(next);
  }

  function movePhoto(id: string, direction: -1 | 1) {
    setComposition((current) => {
      const index = current.photos.findIndex((photo) => photo.photoId === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.photos.length) return current;
      const next = [...current.photos];
      [next[index], next[target]] = [next[target], next[index]];
      return { ...current, photos: next };
    });
  }

  function updateCredit<K extends keyof SharingPosterComposition["credits"]>(key: K, value: SharingPosterComposition["credits"][K]) {
    metadataEditedRef.current = true;
    setComposition((current) => ({ ...current, credits: { ...current.credits, [key]: value } }));
  }

  async function refreshMetadata() {
    if (!confirm(t("refreshMetadataConfirm"))) return;
    setNotice("");
    try {
      const response = await fetch(`/api/dashboard/sharing-posters/${encodeURIComponent(project.id)}/metadata?locale=${locale}`, { cache: "no-store" });
      if (!response.ok) throw new Error("refresh_failed");
      const metadata = (await response.json()) as ReturnType<typeof sharingPosterMetadataFromPhotos>;
      setComposition((current) => ({
        ...current,
        credits: {
          ...current.credits,
          ...metadata,
          cosplayerReviewed: missingCn.length === 0
        }
      }));
      metadataEditedRef.current = false;
      setNotice(t("metadataRefreshed"));
    } catch {
      setNotice(t("metadataRefreshError"));
    }
  }

  async function saveAsCopy() {
    const response = await fetch(`/api/dashboard/sharing-posters/${encodeURIComponent(project.id)}/duplicate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `${name} — ${t("copySuffix")}`, composition })
    });
    if (!response.ok) {
      setSaveState("error");
      return;
    }
    const copy = (await response.json()) as { id: string };
    router.push(`/dashboard/sharing-posters/${copy.id}`);
  }

  async function prepareExport() {
    if (!canExport) return;
    setExportState("preparing");
    setNotice("");
    try {
      await document.fonts?.ready;
      const { loadPosterImages, renderSharingPoster } = await import("@/lib/sharingPosterCanvas");
      const images = await loadPosterImages(photos, "full", 2);
      if (images.size !== photos.length) throw new Error("image_load_failed");
      const canvas = document.createElement("canvas");
      canvas.width = pixelSize.width;
      canvas.height = pixelSize.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("canvas_failed");
      const result = renderSharingPoster(context, canvas.width, canvas.height, composition, photos, images);
      if (result.footerTooTall) throw new Error("footer_too_tall");
      const mime = composition.export.format === "png" ? "image/png" : "image/jpeg";
      const blob = await canvasBlob(canvas, mime, composition.export.format === "jpeg" ? 0.92 : undefined);
      if (prepared) URL.revokeObjectURL(prepared.url);
      const extension = composition.export.format === "png" ? "png" : "jpg";
      setPrepared({
        blob,
        url: URL.createObjectURL(blob),
        filename: `${safeFilename(name)}.${extension}`,
        signature: currentSignatureRef.current
      });
      canvas.width = 1;
      canvas.height = 1;
      setExportState("ready");
    } catch {
      setExportState("error");
    }
  }

  async function sharePrepared() {
    if (!prepared || !navigator.share) return;
    const file = new File([prepared.blob], prepared.filename, { type: prepared.blob.type });
    if (navigator.canShare && !navigator.canShare({ files: [file] })) return;
    try {
      await navigator.share({ files: [file], title: name });
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") setNotice(t("shareError"));
    }
  }

  const saveLabels: Record<SaveState, string> = {
    saved: t("saved"),
    dirty: t("unsaved"),
    saving: t("saving"),
    error: t("saveError"),
    conflict: t("saveConflict")
  };

  const tabButtons = (
    <div role="tablist" aria-label={t("editorSections")} className="grid grid-cols-3 rounded-lg border border-border bg-control p-1">
      {(["photos", "layout", "credits"] as const).map((tab, index) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={activeTab === tab}
          onClick={() => setActiveTab(tab)}
          className={`min-h-11 rounded-md px-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${activeTab === tab ? "bg-raised text-fg" : "text-fg-subtle hover:text-fg"}`}
        >
          <span className="font-meta mr-1 text-[0.65rem] text-accent">0{index + 1}</span>{t(tab)}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <Link href="/dashboard/sharing-posters" className="mb-2 inline-flex min-h-10 items-center text-sm font-semibold text-fg-subtle hover:text-accent">← {t("backToProjects")}</Link>
          <label className="block">
            <span className="sr-only">{t("projectName")}</span>
            <input value={name} required aria-invalid={!name.trim()} maxLength={120} onChange={(event) => setName(event.target.value)} className="font-display w-full border-0 bg-transparent p-0 text-3xl font-semibold tracking-[-0.03em] text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent/30" />
          </label>
          {!name.trim() && <p role="alert" className="mt-2 text-sm text-danger">{t("projectNameRequired")}</p>}
        </div>
        <div className="flex items-center gap-2">
          <p role={saveState === "error" || saveState === "conflict" ? "alert" : "status"} className={`font-meta text-xs ${saveState === "error" || saveState === "conflict" ? "text-danger" : saveState === "saving" || saveState === "dirty" ? "text-accent" : "text-success"}`}>{saveLabels[saveState]}</p>
          {saveState === "error" && <Button size="compact" onClick={() => { setSaveState("dirty"); setSaveCycle((value) => value + 1); }}>{t("retry")}</Button>}
        </div>
      </div>

      {saveState === "conflict" && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning-border bg-warning-surface p-4 text-sm text-fg-muted">
          <span>{t("conflictHint")}</span>
          <div className="flex gap-2"><Button onClick={() => window.location.reload()}>{t("reload")}</Button><Button variant="primary" onClick={() => void saveAsCopy()}>{t("saveAsCopy")}</Button></div>
        </div>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(22rem,0.85fr)_minmax(28rem,1.15fr)]">
        <section aria-label={t("preview")} className="sticky top-16 z-20 flex max-h-[48dvh] items-center justify-center overflow-auto rounded-xl border border-border bg-surface-2 p-3 lg:order-2 lg:top-6 lg:max-h-[calc(100dvh-4rem)] lg:p-6">
          <SharingPosterCanvas
            composition={composition}
            photos={photos}
            selectedPhotoId={selectedPhotoId}
            onSelectPhoto={setSelectedPhotoId}
            onCropChange={(id, crop) => updatePhoto(id, (photo) => ({ ...photo, crop }))}
            onRenderMetrics={handleMetrics}
            ariaLabel={t("previewAria")}
            unavailableLabel={t("unavailable")}
          />
        </section>

        <aside className="min-w-0 space-y-4 lg:order-1">
          <div className="sticky bottom-0 z-30 bg-page pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 lg:static lg:p-0">{tabButtons}</div>

          <section role="tabpanel" hidden={activeTab !== "photos"} className="rounded-xl border border-border bg-surface p-4 sm:p-5">
            <h2 className="font-display text-2xl font-semibold tracking-[-0.025em]">{t("photosTitle")}</h2>
            <p className="mt-1 text-sm leading-6 text-fg-subtle">{t("photosHint")}</p>
            {selectedPhoto && (
              <div className="mt-4 rounded-xl border border-border bg-raised p-4">
                <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">{t("selectedPhoto")}</h3><span className="font-meta text-xs text-accent">{composition.photos.findIndex((photo) => photo.photoId === selectedPhoto.photoId) + 1} / {photos.length}</span></div>
                <label className="mt-4 grid gap-2 text-sm font-semibold text-fg-muted">
                  <span className="flex justify-between"><span>{t("visualWeight")}</span><span className="font-meta">{selectedPhoto.composition.weight}</span></span>
                  <input type="range" min="1" max="5" step="1" value={selectedPhoto.composition.weight} onChange={(event) => updatePhoto(selectedPhoto.photoId, (photo) => ({ ...photo, weight: Number(event.target.value) }))} className="min-h-11 accent-accent" />
                </label>
                <div className="mt-4 grid gap-2">
                  <span className="text-sm font-semibold text-fg-muted">{t("cropMode")}</span>
                  <div role="group" aria-label={t("cropMode")} className="grid grid-cols-2 gap-2">
                    {(["auto", "manual"] as const).map((mode) => {
                      const active = (selectedPhoto.composition.crop?.mode ?? "manual") === mode;
                      return <button key={mode} type="button" aria-pressed={active} onClick={() => setCropMode(selectedPhoto, mode)} className={`min-h-11 rounded-lg border px-2 text-sm font-semibold ${active ? "border-accent bg-accent-surface text-accent-strong" : "border-border-strong bg-raised text-fg-muted"}`}>{t(mode === "auto" ? "cropModeAuto" : "cropModeManual")}</button>;
                    })}
                  </div>
                </div>
                {selectedPhoto.composition.crop?.mode === "auto" ? (
                  <p className="mt-2 text-xs text-fg-subtle" aria-live="polite">{t(selectedPhoto.source?.subjectState === "detected" ? "subjectDetected" : selectedPhoto.source?.subjectState === "none" ? "subjectNone" : "subjectDetecting")}</p>
                ) : (
                  <>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <label className="grid gap-1 text-sm font-semibold text-fg-muted">{t("cropHorizontal")}<input type="number" min="0" max="100" value={Math.round(cropValue(selectedPhoto).x * 100)} onChange={(event) => setCropAxis(selectedPhoto, "x", Number(event.target.value) / 100)} className={fieldClasses} /></label>
                      <label className="grid gap-1 text-sm font-semibold text-fg-muted">{t("cropVertical")}<input type="number" min="0" max="100" value={Math.round(cropValue(selectedPhoto).y * 100)} onChange={(event) => setCropAxis(selectedPhoto, "y", Number(event.target.value) / 100)} className={fieldClasses} /></label>
                    </div>
                    <p className="mt-2 text-xs text-fg-subtle">{t("cropHint")}</p>
                  </>
                )}
              </div>
            )}
            <div className="mt-5"><SharingPosterPhotoPicker locale={locale} events={events} photos={photos} onAdd={addPhoto} onRemove={removePhoto} onMove={movePhoto} onSelect={setSelectedPhotoId} /></div>
          </section>

          <section role="tabpanel" hidden={activeTab !== "layout"} className="rounded-xl border border-border bg-surface p-4 sm:p-5">
            <h2 className="font-display text-2xl font-semibold tracking-[-0.025em]">{t("layoutTitle")}</h2>
            <p className="mt-1 text-sm leading-6 text-fg-subtle">{t("layoutHint")}</p>
            <div className="mt-5 grid grid-cols-3 gap-2">
              {ratioPresets.map(([width, height, label]) => <button key={label} type="button" onClick={() => setComposition((current) => ({ ...current, ratio: { width, height } }))} className={`min-h-11 rounded-lg border px-2 text-sm font-semibold ${composition.ratio.width === width && composition.ratio.height === height ? "border-accent bg-accent-surface text-accent-strong" : "border-border-strong bg-raised text-fg-muted"}`}>{label}</button>)}
            </div>
            <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-end gap-2">
              <label className="grid gap-1 text-sm font-semibold text-fg-muted">{t("ratioWidth")}<input type="number" min="1" max="100" value={composition.ratio.width} onChange={(event) => setComposition((current) => ({ ...current, ratio: { ...current.ratio, width: Math.min(100, Math.max(1, Number(event.target.value))) } }))} className={fieldClasses} /></label>
              <Button aria-label={t("swapOrientation")} onClick={() => setComposition((current) => ({ ...current, ratio: { width: current.ratio.height, height: current.ratio.width } }))}>↔</Button>
              <label className="grid gap-1 text-sm font-semibold text-fg-muted">{t("ratioHeight")}<input type="number" min="1" max="100" value={composition.ratio.height} onChange={(event) => setComposition((current) => ({ ...current, ratio: { ...current.ratio, height: Math.min(100, Math.max(1, Number(event.target.value))) } }))} className={fieldClasses} /></label>
            </div>
            <div className="mt-5 grid gap-4">
              <RangeField label={t("outerMargin")} value={composition.style.marginPercent} min={0} max={12} step={0.25} suffix="%" onChange={(value) => setComposition((current) => ({ ...current, style: { ...current.style, marginPercent: value } }))} />
              <RangeField label={t("photoGap")} value={composition.style.gapPercent} min={0} max={5} step={0.1} suffix="%" onChange={(value) => setComposition((current) => ({ ...current, style: { ...current.style, gapPercent: value } }))} />
              <RangeField label={t("footerTextSize")} value={composition.style.footerTextPercent} min={1} max={4} step={0.1} suffix="%" onChange={(value) => setComposition((current) => ({ ...current, style: { ...current.style, footerTextPercent: value } }))} />
              <RangeField label={t("textGap")} value={composition.style.textGapPercent ?? Math.min(8, Math.round(legacyTextGapPercent(composition.style) * 10) / 10)} min={0} max={8} step={0.1} suffix="%" onChange={(value) => setComposition((current) => ({ ...current, style: { ...current.style, textGapPercent: value } }))} />
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1 text-sm font-semibold text-fg-muted">{t("backgroundColor")}<input type="color" value={composition.style.backgroundColor} onChange={(event) => setComposition((current) => ({ ...current, style: { ...current.style, backgroundColor: event.target.value } }))} className="h-11 w-full rounded-lg border border-border-strong bg-control p-1" /></label>
                <label className="grid gap-1 text-sm font-semibold text-fg-muted">{t("textColor")}<input type="color" value={composition.style.textColor} onChange={(event) => setComposition((current) => ({ ...current, style: { ...current.style, textColor: event.target.value } }))} className="h-11 w-full rounded-lg border border-border-strong bg-control p-1" /></label>
              </div>
              <div className="grid gap-3">
                <span className="text-sm font-semibold text-fg-muted">{t("backgroundMode")}</span>
                <div role="group" aria-label={t("backgroundMode")} className="grid grid-cols-2 gap-2">
                  {(["solid", "glass"] as const).map((mode) => {
                    const active = (composition.style.background?.mode ?? "solid") === mode;
                    return <button key={mode} type="button" aria-pressed={active} onClick={() => setComposition((current) => ({ ...current, style: { ...current.style, background: mode === "glass" ? (current.style.background?.mode === "glass" ? current.style.background : { mode: "glass", ...SHARING_POSTER_GLASS_DEFAULTS }) : { mode: "solid" } } }))} className={`min-h-11 rounded-lg border px-2 text-sm font-semibold ${active ? "border-accent bg-accent-surface text-accent-strong" : "border-border-strong bg-raised text-fg-muted"}`}>{t(mode === "glass" ? "backgroundGlass" : "backgroundSolid")}</button>;
                  })}
                </div>
                {composition.style.background?.mode === "glass" && (
                  <>
                    <p className="text-sm leading-6 text-fg-subtle">{t("glassHint")}</p>
                    <RangeField label={t("glassBlur")} value={composition.style.background.blurPercent} min={0.5} max={8} step={0.1} suffix="%" onChange={(value) => setComposition((current) => current.style.background?.mode === "glass" ? { ...current, style: { ...current.style, background: { ...current.style.background, blurPercent: value } } } : current)} />
                    <RangeField label={t("glassTint")} value={Math.round(composition.style.background.tintOpacity * 100)} min={0} max={90} step={5} suffix="%" onChange={(value) => setComposition((current) => current.style.background?.mode === "glass" ? { ...current, style: { ...current.style, background: { ...current.style.background, tintOpacity: value / 100 } } } : current)} />
                  </>
                )}
              </div>
            </div>
          </section>

          <section role="tabpanel" hidden={activeTab !== "credits"} className="rounded-xl border border-border bg-surface p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-display text-2xl font-semibold tracking-[-0.025em]">{t("creditsTitle")}</h2><p className="mt-1 text-sm leading-6 text-fg-subtle">{t("creditsHint")}</p></div><Button size="compact" onClick={() => void refreshMetadata()}>{t("refreshFromGallery")}</Button></div>
            <div className="mt-5 grid gap-4">
              <TextField label={t("cosplayerCn")} required value={composition.credits.cosplayer} onChange={(value) => { updateCredit("cosplayer", value); updateCredit("cosplayerReviewed", true); }} />
              {missingCn.length > 0 && !composition.credits.cosplayerReviewed && <p role="alert" className="rounded-lg border border-warning-border bg-warning-surface p-3 text-sm text-fg-muted">{t("missingCnReview", { count: missingCn.length })}</p>}
              <TextField label={t("photographerCredit")} required value={composition.credits.photographer} onChange={(value) => updateCredit("photographer", value)} />
              <OptionalCredit label={t("cameraModel")} checked={composition.credits.showCamera} value={composition.credits.camera} onToggle={(value) => updateCredit("showCamera", value)} onChange={(value) => updateCredit("camera", value)} />
              <OptionalCredit label={t("lensModel")} checked={composition.credits.showLens} value={composition.credits.lens} onToggle={(value) => updateCredit("showLens", value)} onChange={(value) => updateCredit("lens", value)} />
              <OptionalCredit label={t("eventName")} checked={composition.credits.showEvent} value={composition.credits.event} onToggle={(value) => updateCredit("showEvent", value)} onChange={(value) => updateCredit("event", value)} />
              <OptionalCredit label={t("date")} checked={composition.credits.showDate} value={composition.credits.date} onToggle={(value) => updateCredit("showDate", value)} onChange={(value) => updateCredit("date", value)} />
              <OptionalCredit label={t("location")} checked={composition.credits.showLocation} value={composition.credits.location} onToggle={(value) => updateCredit("showLocation", value)} onChange={(value) => updateCredit("location", value)} />
            </div>
            {notice && <p role="status" className="mt-4 text-sm text-fg-subtle">{notice}</p>}
          </section>

          <section className="rounded-xl border border-border bg-raised p-4 sm:p-5">
            <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold">{t("exportTitle")}</h2><p className="mt-1 text-sm text-fg-subtle">{pixelSize.width} × {pixelSize.height} px</p></div><span className="font-meta text-xs text-accent">{composition.export.format.toUpperCase()}</span></div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="grid gap-1 text-sm font-semibold text-fg-muted">{t("format")}<select value={composition.export.format} onChange={(event) => setComposition((current) => ({ ...current, export: { ...current.export, format: event.target.value === "png" ? "png" : "jpeg" } }))} className={fieldClasses}><option value="jpeg">JPEG · 92%</option><option value="png">PNG</option></select></label>
              <label className="grid gap-1 text-sm font-semibold text-fg-muted">{t("longestEdge")}<select value={composition.export.longestEdge} onChange={(event) => setComposition((current) => ({ ...current, export: { ...current.export, longestEdge: Number(event.target.value) } }))} className={fieldClasses}><option value="2160">2160 px</option><option value="4096">4096 px</option><option value="8192">8192 px</option></select></label>
            </div>
            {composition.export.longestEdge > 4096 && <p className="mt-3 text-sm text-fg-subtle">{t("largeExportHint")}</p>}
            {unresolved.length > 0 && <p role="alert" className="mt-3 text-sm text-danger">{t("unresolvedError", { count: unresolved.length })}</p>}
            {photos.length === 0 && <p role="alert" className="mt-3 text-sm text-warning">{t("selectPhotoFirst")}</p>}
            {!composition.credits.cosplayer.trim() && <p role="alert" className="mt-3 text-sm text-warning">{t("cosplayerRequired")}</p>}
            {!composition.credits.photographer.trim() && <p role="alert" className="mt-3 text-sm text-warning">{t("photographerRequired")}</p>}
            {metrics.footerTooTall && <p role="alert" className="mt-3 text-sm text-warning">{t("footerTooTall")}</p>}
            {metrics.rectangles.some((rect) => { const photo = photos.find((candidate) => candidate.photoId === rect.id)?.source; const scale = pixelSize.width / 900; return photo ? rect.width * scale > photo.width || rect.height * scale > photo.height : false; }) && <p className="mt-3 text-sm text-warning">{t("upscaleWarning")}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" disabled={!canExport || exportState === "preparing"} onClick={() => void prepareExport()}>{exportState === "preparing" ? t("preparing") : t("prepareExport")}</Button>
              {prepared && <a href={prepared.url} download={prepared.filename} className={buttonClasses()}>{t("download")}</a>}
              {prepared && nativeShareAvailable && <Button onClick={() => void sharePrepared()}>{t("share")}</Button>}
            </div>
            {exportState === "ready" && <p role="status" className="mt-3 text-sm text-success">{t("exportReady")}</p>}
            {exportState === "error" && <p role="alert" className="mt-3 text-sm text-danger">{t("exportError")}</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}

function RangeField({ label, value, min, max, step, suffix, onChange }: { label: string; value: number; min: number; max: number; step: number; suffix: string; onChange: (value: number) => void }) {
  return <label className="grid gap-2 text-sm font-semibold text-fg-muted"><span className="flex justify-between gap-3"><span>{label}</span><span className="font-meta text-xs text-fg-subtle">{value}{suffix}</span></span><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="min-h-11 accent-accent" /></label>;
}

function TextField({ label, value, onChange, required = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return <label className="grid gap-1 text-sm font-semibold text-fg-muted">{label}{required && <span className="text-accent" aria-hidden="true"> *</span>}<textarea rows={2} value={value} required={required} onChange={(event) => onChange(event.target.value)} className={fieldClasses} /></label>;
}

function OptionalCredit({ label, checked, value, onToggle, onChange }: { label: string; checked: boolean; value: string; onToggle: (value: boolean) => void; onChange: (value: string) => void }) {
  return <div className="rounded-lg border border-border bg-raised p-3"><label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={checked} onChange={(event) => onToggle(event.target.checked)} className="h-5 w-5 accent-accent" />{label}</label>{checked && <textarea rows={2} value={value} onChange={(event) => onChange(event.target.value)} className={`${fieldClasses} mt-2`} />}</div>;
}
