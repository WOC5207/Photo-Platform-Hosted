"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import type {
  SharingPosterComposition,
  SharingPosterCreditKind,
  SharingPosterCreditLine,
  SharingPosterFit,
  SharingPosterPhotoValue,
  SharingPosterResolvedPhoto
} from "@/lib/sharingPoster";
import type { SharingPosterRenderResult } from "@/lib/sharingPosterCanvas";
import type { PosterStage } from "../../poster";

/**
 * The 3D Sharepost creator's working state, kept in the /3d/sharepost layout
 * so the photographs, layout, credits and print screens share one draft. It
 * is the classic public editor's draft (/sharing-poster): the visitor's
 * photographs stay in this browser, kept in IndexedDB.
 */

// The poster code (layout, glass, schema) loads with the draft, not with the page.
const loadTools = () =>
  Promise.all([
    import("@/lib/sharingPoster"),
    import("@/lib/sharingPosterCanvas"),
    import("@/lib/sharingPosterLayout"),
    import("@/lib/sharingPosterRatio"),
    import("@/components/sharing-posters/localSharingPoster")
  ]).then(([poster, canvas, layout, ratio, local]) => ({ ...poster, ...canvas, ...layout, ...ratio, ...local }));
export type SharepostTools = Awaited<ReturnType<typeof loadTools>>;

export type Metrics = Pick<SharingPosterRenderResult, "footerTooTall" | "wrappedLineCount" | "photoRects" | "text"> & {
  /** The canvas the rectangles were measured on. */
  width: number;
  height: number;
};

export interface SharepostStudio {
  status: "reading" | "ready";
  tools: SharepostTools | null;
  name: string;
  setName(name: string): void;
  composition: SharingPosterComposition | null;
  update(change: (current: SharingPosterComposition) => SharingPosterComposition): void;
  photos: SharingPosterResolvedPhoto[];
  /** Preview renditions by photo id, and uploaded layer images by token. */
  images: Map<string, HTMLImageElement>;
  layerImages: Map<string, HTMLImageElement>;
  /** A thumbnail for the rail, loaded on first ask. */
  thumb(src: string | undefined): HTMLImageElement | null;
  addFiles(files: File[]): Promise<void>;
  reading: { done: number; total: number } | null;
  readNotice: { failed: number; skipped: number };
  removePhoto(id: string): void;
  movePhoto(id: string, index: number): void;
  /** Larger (1) or smaller (−1): a step of weight, or a place in the size ranking. */
  resizePhoto(id: string, delta: 1 | -1): void;
  setFit(fit: SharingPosterFit): void;
  addCreditLine(kind: SharingPosterCreditKind): string;
  setCreditValue(id: string, value: string): void;
  updateCreditLines(change: (lines: SharingPosterCreditLine[]) => SharingPosterCreditLine[]): void;
  metrics: Metrics | null;
  saved: "idle" | "dirty" | "saved" | "error";
  /** Paints the poster on the easel and measures it; `selected` rings a photograph. */
  paint(scene: PosterStage, options?: { selected?: string | null; composition?: SharingPosterComposition; key?: string }): Metrics | null;
}

const StudioContext = createContext<SharepostStudio | null>(null);

export function useSharepostStudio(): SharepostStudio {
  const studio = useContext(StudioContext);
  if (!studio) throw new Error("SharepostStudio missing");
  return studio;
}

/** The easel's poster: a little over the classic preview, so the glass renders quickly. */
const MAT_EDGE = 1440;

function newCreditLineId(kind: SharingPosterCreditKind, lines: SharingPosterCreditLine[]): string {
  for (;;) {
    const id = `${kind}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    if (!lines.some((line) => line.id === id)) return id;
  }
}

export default function SharepostStudioProvider({ children }: { children: ReactNode }) {
  const t = useTranslations("sharingPosters");
  const ta = useTranslations("album3d");
  const locale = useLocale();
  const [status, setStatus] = useState<"reading" | "ready">("reading");
  const [tools, setTools] = useState<SharepostTools | null>(null);
  const [name, setName] = useState("");
  const [composition, setComposition] = useState<SharingPosterComposition | null>(null);
  const [sources, setSources] = useState<Map<string, SharingPosterPhotoValue | null>>(new Map());
  const [layerImages, setLayerImages] = useState<Map<string, HTMLImageElement>>(new Map());
  const [reading, setReading] = useState<{ done: number; total: number } | null>(null);
  const [readNotice, setReadNotice] = useState({ failed: 0, skipped: 0 });
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [saved, setSaved] = useState<"idle" | "dirty" | "saved" | "error">("idle");
  const cache = useRef(new Map<string, HTMLImageElement | "loading" | "failed">());
  const [imageVersion, setImageVersion] = useState(0);
  // Gallery-derived credits refill as photographs arrive until the visitor edits one, as in the classic editor.
  const metadataEdited = useRef(false);
  const lastSaved = useRef("");

  useEffect(() => {
    let live = true;
    loadTools()
      .then(async (loaded) => {
        const fresh = loaded.defaultSharingPosterComposition(locale, "");
        // Without IndexedDB (a private window) the visitor still edits; nothing is kept.
        const stored = await loaded.readLocalPosterDraft(fresh).catch(() => null);
        if (!live) return;
        const draftName = stored?.name || t("localDefaultName");
        const draft = stored?.composition ?? fresh;
        metadataEdited.current = draft.photos.length > 0;
        lastSaved.current = JSON.stringify({ name: draftName, composition: draft });
        setTools(loaded);
        setName(draftName);
        setComposition(draft);
        setSources(new Map(stored?.photos.map((photo) => [photo.photoId, photo.source]) ?? []));
        setStatus("ready");
        if (draft.layers?.length) void loaded.loadPosterLayerImages(draft.layers).then((images) => live && setLayerImages(images));
      })
      .catch(() => live && setStatus("ready"));
    return () => {
      live = false;
    };
  }, [locale, t]);

  const photos = useMemo<SharingPosterResolvedPhoto[]>(
    () => composition?.photos.map((photo) => ({ photoId: photo.photoId, composition: photo, source: sources.get(photo.photoId) ?? null })) ?? [],
    [composition?.photos, sources]
  );
  const photosRef = useRef(photos);
  photosRef.current = photos;

  // Autosave like the classic public editor: shortly after the last change, while the poster has a name.
  const signature = useMemo(() => (composition ? JSON.stringify({ name, composition }) : ""), [name, composition]);
  useEffect(() => {
    if (!tools || !composition || signature === lastSaved.current) return;
    setSaved("dirty");
    if (!name.trim()) return;
    const timer = window.setTimeout(() => {
      tools
        .saveLocalPosterDraft({ name, composition })
        .then(() => {
          lastSaved.current = signature;
          setSaved("saved");
        })
        .catch(() => setSaved("error"));
    }, 900);
    return () => window.clearTimeout(timer);
  }, [tools, composition, name, signature]);

  const update = useCallback((change: (current: SharingPosterComposition) => SharingPosterComposition) => {
    setComposition((current) => (current ? change(current) : current));
  }, []);

  // A size ranking follows photographs as they come and go; an adaptive
  // poster keeps the shape their collage fills (both as the classic editor).
  useEffect(() => {
    if (tools) update((current) => tools.applySharingPosterSizeRank(current));
  }, [tools, update, composition?.photos, composition?.sizeRank]);
  const adaptive = composition?.ratio.adaptive === true;
  const adaptiveRatio = useMemo(
    () => (tools && composition && adaptive ? tools.adaptivePosterRatio(photos, composition.style, metrics?.wrappedLineCount ?? 0) : null),
    [tools, adaptive, photos, composition, metrics?.wrappedLineCount]
  );
  useEffect(() => {
    if (!adaptiveRatio) return;
    update((current) =>
      current.ratio.adaptive && (current.ratio.width !== adaptiveRatio.width || current.ratio.height !== adaptiveRatio.height)
        ? { ...current, ratio: { ...adaptiveRatio, adaptive: true } }
        : current
    );
  }, [adaptiveRatio, update]);

  const load = useCallback((src: string | undefined) => {
    if (!src) return null;
    const found = cache.current.get(src);
    if (found instanceof HTMLImageElement) return found;
    if (!found) {
      cache.current.set(src, "loading");
      const image = new Image();
      image.decoding = "async";
      image.onload = () => {
        cache.current.set(src, image);
        setImageVersion((v) => v + 1);
      };
      image.onerror = () => cache.current.set(src, "failed");
      image.src = src;
    }
    return null;
  }, []);

  const images = useMemo(() => {
    const map = new Map<string, HTMLImageElement>();
    for (const photo of photos) {
      const image = load(photo.source?.previewUrl);
      if (image) map.set(photo.photoId, image);
    }
    return map;
    // imageVersion: previews that finished loading since.
  }, [photos, load, imageVersion]);

  const syncMetadata = useCallback(
    (next: SharingPosterResolvedPhoto[]) => {
      if (metadataEdited.current || !tools) return;
      const available = next.flatMap((photo) => (photo.source ? [photo.source] : []));
      const metadata = tools.sharingPosterMetadataFromPhotos(available);
      update((current) => ({
        ...current,
        credits: { lines: tools.withSharingPosterMetadata(current.credits.lines, metadata), cosplayerReviewed: available.every((photo) => photo.creditNames.length > 0) }
      }));
    },
    [tools, update]
  );

  const addFiles = useCallback(
    async (files: File[]) => {
      if (!tools || reading) return;
      const pictures = files.filter((file) => file.type.startsWith("image/") || file.type === "");
      const room = tools.SHARING_POSTER_MAX_PHOTOS - photosRef.current.length;
      const accepted = pictures.slice(0, Math.max(0, room));
      let failed = 0;
      setReading({ done: 0, total: accepted.length });
      // One at a time: a full-size photograph decodes into a lot of memory.
      for (const [index, file] of accepted.entries()) {
        try {
          const source = await tools.addLocalPhoto(file);
          const entry = { photoId: source.id, weight: source.homeWeight, focalX: 0.5, focalY: 0.5, crop: { mode: "auto" as const } };
          const next = [...photosRef.current, { photoId: source.id, composition: entry, source }];
          photosRef.current = next;
          setSources((current) => new Map(current).set(source.id, source));
          update((current) => (current.photos.length >= tools.SHARING_POSTER_MAX_PHOTOS ? current : { ...current, photos: [...current.photos, entry] }));
          syncMetadata(next);
        } catch {
          failed += 1;
        }
        setReading({ done: index + 1, total: accepted.length });
      }
      setReading(null);
      setReadNotice({ failed, skipped: pictures.length - accepted.length });
    },
    [tools, reading, update, syncMetadata]
  );

  const removePhoto = useCallback(
    (id: string) => {
      const next = photosRef.current.filter((photo) => photo.photoId !== id);
      update((current) => ({ ...current, photos: current.photos.filter((photo) => photo.photoId !== id) }));
      syncMetadata(next);
    },
    [update, syncMetadata]
  );

  const movePhoto = useCallback(
    (id: string, index: number) =>
      update((current) => {
        const from = current.photos.findIndex((photo) => photo.photoId === id);
        const to = Math.max(0, Math.min(current.photos.length - 1, index));
        if (from < 0 || from === to) return current;
        const next = [...current.photos];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        return { ...current, photos: next };
      }),
    [update]
  );

  const resizePhoto = useCallback(
    (id: string, delta: 1 | -1) =>
      update((current) => {
        if (current.sizeRank && tools) {
          const rank = [...current.sizeRank];
          const index = rank.indexOf(id);
          const target = index - delta;
          if (index < 0 || target < 0 || target >= rank.length) return current;
          [rank[index], rank[target]] = [rank[target], rank[index]];
          return tools.applySharingPosterSizeRank({ ...current, sizeRank: rank });
        }
        return {
          ...current,
          photos: current.photos.map((photo) => (photo.photoId === id ? { ...photo, weight: Math.max(1, Math.min(5, Math.round(photo.weight) + delta)) } : photo))
        };
      }),
    [tools, update]
  );

  // Whole photographs leave space in their frames, so they bring the glass with them (as the classic editor).
  const setFit = useCallback(
    (fit: SharingPosterFit) =>
      update((current) => ({
        ...current,
        ratio: fit === "collage" ? current.ratio : { width: current.ratio.width, height: current.ratio.height },
        style: {
          ...current.style,
          fit,
          background:
            fit !== "fill" && current.style.background?.mode !== "glass" && tools
              ? { mode: "glass", ...tools.SHARING_POSTER_WHOLE_GLASS_DEFAULTS }
              : current.style.background
        }
      })),
    [tools, update]
  );

  const updateCreditLines = useCallback(
    (change: (lines: SharingPosterCreditLine[]) => SharingPosterCreditLine[]) =>
      update((current) => {
        const lines = change(current.credits.lines);
        return lines === current.credits.lines ? current : { ...current, credits: { ...current.credits, lines } };
      }),
    [update]
  );

  const addCreditLine = useCallback(
    (kind: SharingPosterCreditKind) => {
      const lines = composition?.credits.lines ?? [];
      const id = newCreditLineId(kind, lines);
      const available = photosRef.current.flatMap((photo) => (photo.source ? [photo.source] : []));
      const value = tools && kind !== "photographer" ? (tools.sharingPosterCreditMetadataValue(kind, tools.sharingPosterMetadataFromPhotos(available)) ?? "") : "";
      updateCreditLines((current) => (current.length >= (tools?.SHARING_POSTER_MAX_CREDIT_LINES ?? 20) ? current : [...current, { id, kind, value }]));
      return id;
    },
    [composition?.credits.lines, tools, updateCreditLines]
  );

  const setCreditValue = useCallback(
    (id: string, value: string) => {
      const kind = composition?.credits.lines.find((line) => line.id === id)?.kind;
      if (kind && tools?.SHARING_POSTER_METADATA_KINDS.includes(kind)) metadataEdited.current = true;
      update((current) => ({
        ...current,
        credits: {
          lines: current.credits.lines.map((line) => (line.id === id ? { ...line, value } : line)),
          cosplayerReviewed: current.credits.cosplayerReviewed || kind === "cosplayer"
        }
      }));
    },
    [composition?.credits.lines, tools, update]
  );

  const paint = useCallback(
    (scene: PosterStage, options: { selected?: string | null; composition?: SharingPosterComposition; key?: string } = {}) => {
      const shown = options.composition ?? composition;
      if (!tools || !shown) return null;
      const size = tools.sharingPosterPixelSize(shown);
      const canvas = scene.setPoster(options.key ?? "sharepost", size.width / size.height, MAT_EDGE);
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      const result = tools.renderSharingPoster(ctx, canvas.width, canvas.height, shown, photos, images, {
        layerImages,
        unavailableLabel: ta("creatorPhotoMissing"),
        selectedPhotoId: options.selected ?? null,
        selectionColor: scene.accent()
      });
      scene.refresh();
      const measured: Metrics = { footerTooTall: result.footerTooTall, wrappedLineCount: result.wrappedLineCount, photoRects: result.photoRects, text: result.text, width: canvas.width, height: canvas.height };
      // Only the live poster's measurements drive the adaptive ratio and the checks.
      if (!options.composition) {
        setMetrics((current) =>
          current &&
          current.footerTooTall === measured.footerTooTall &&
          current.wrappedLineCount === measured.wrappedLineCount &&
          current.width === measured.width &&
          JSON.stringify(current.photoRects) === JSON.stringify(measured.photoRects) &&
          JSON.stringify(current.text) === JSON.stringify(measured.text)
            ? current
            : measured
        );
      }
      return measured;
    },
    [tools, composition, photos, images, layerImages, ta]
  );

  const value = useMemo<SharepostStudio>(
    () => ({
      status,
      tools,
      name,
      setName,
      composition,
      update,
      photos,
      images,
      layerImages,
      thumb: load,
      addFiles,
      reading,
      readNotice,
      removePhoto,
      movePhoto,
      resizePhoto,
      setFit,
      addCreditLine,
      setCreditValue,
      updateCreditLines,
      metrics,
      saved,
      paint
    }),
    [status, tools, name, composition, update, photos, images, layerImages, load, addFiles, reading, readNotice, removePhoto, movePhoto, resizePhoto, setFit, addCreditLine, setCreditValue, updateCreditLines, metrics, saved, paint]
  );

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}
