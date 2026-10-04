"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { normalizeCosplanLayerOrder, type CosplanComposition, type CosplanTemplateSummary } from "@/lib/cosplanTypes";
import { readDraft, restoreDraft, writeDraft } from "@/lib/cosplanDraft";
import type { CosplanImages } from "@/lib/cosplanCanvas";

/**
 * The 3D Cosplan creator's working state, kept in the /3d/cosplan layout so
 * the backgrounds, the board and the print screen share one draft and one
 * undo history. The draft is the same IndexedDB record the classic editor
 * (/cosplan) reads and writes.
 */

const HISTORY = 50;

export interface CosplanStudio {
  templates: CosplanTemplateSummary[];
  /** "reading" until the browser's draft store answers. */
  status: "reading" | "ready";
  composition: CosplanComposition | null;
  /** Replace the poster; `record` (the default) makes it an undo step. */
  apply(next: CosplanComposition, record?: boolean): void;
  /** Start an undo step now, for a drag or a text edit that then applies without recording. */
  begin(): void;
  /** Drop the step begin() started, putting the poster back as it was then. */
  cancel(): void;
  /** Forget the step begin() started when nothing changed. */
  discardIfUnchanged(): void;
  undo(): void;
  redo(): void;
  canUndo: boolean;
  canRedo: boolean;
  saved: "idle" | "saved" | "error";
  /** Loaded images: the background, the foreground frame and every character. */
  images: CosplanImages;
  /** Image cache by URL, also for template previews; bumps `imageVersion` as images arrive. */
  image(src: string | null | undefined): HTMLImageElement | null;
  imageVersion: number;
  /** An object URL this studio made, revoked when the visitor leaves the creator. */
  track(url: string): string;
}

const StudioContext = createContext<CosplanStudio | null>(null);

export function useCosplanStudio(): CosplanStudio {
  const studio = useContext(StudioContext);
  if (!studio) throw new Error("CosplanStudio missing");
  return studio;
}

export default function CosplanStudioProvider({ templates, children }: { templates: CosplanTemplateSummary[]; children: ReactNode }) {
  const [status, setStatus] = useState<"reading" | "ready">("reading");
  const [composition, setComposition] = useState<CosplanComposition | null>(null);
  const compositionRef = useRef(composition);
  compositionRef.current = composition;
  const past = useRef<CosplanComposition[]>([]);
  const future = useRef<CosplanComposition[]>([]);
  const pending = useRef<CosplanComposition | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [saved, setSaved] = useState<"idle" | "saved" | "error">("idle");
  const dirty = useRef(false);
  const urls = useRef(new Set<string>());
  const cache = useRef(new Map<string, HTMLImageElement | "loading" | "failed">());
  const [imageVersion, setImageVersion] = useState(0);

  useEffect(() => {
    let live = true;
    readDraft()
      .then((stored) => {
        if (!live) return;
        if (stored) {
          const restored = restoreDraft(stored);
          for (const layer of restored.layers) if (layer.type === "image" && layer.src.startsWith("blob:")) urls.current.add(layer.src);
          setComposition({ ...restored, layers: normalizeCosplanLayerOrder(restored.layers) });
        }
        setStatus("ready");
      })
      // Without IndexedDB (a private window) the visitor still edits; nothing is kept.
      .catch(() => live && setStatus("ready"));
    const owned = urls.current;
    return () => {
      live = false;
      // Save what the last few keystrokes changed before the object URLs go.
      if (dirty.current && compositionRef.current) void writeDraft(compositionRef.current).catch(() => undefined);
      for (const url of owned) URL.revokeObjectURL(url);
    };
  }, []);

  // Closing the tab or leaving for the classic editor mid-edit keeps the last change too.
  useEffect(() => {
    const flush = () => {
      if (dirty.current && compositionRef.current) void writeDraft(compositionRef.current).then(() => (dirty.current = false), () => undefined);
    };
    const onVisibility = () => document.visibilityState === "hidden" && flush();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Autosave, as the classic editor does: shortly after the last change.
  useEffect(() => {
    if (!composition || !dirty.current) return;
    const timer = window.setTimeout(() => {
      writeDraft(composition)
        .then(() => {
          dirty.current = false;
          setSaved("saved");
        })
        .catch(() => setSaved("error"));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [composition]);

  const set = useCallback((next: CosplanComposition) => {
    dirty.current = true;
    setComposition({ ...next, layers: normalizeCosplanLayerOrder(next.layers), updatedAt: Date.now() });
  }, []);

  const apply = useCallback(
    (next: CosplanComposition, record = true) => {
      const current = compositionRef.current;
      if (record && current) {
        past.current = [...past.current.slice(-(HISTORY - 1)), current];
        future.current = [];
        setHistoryVersion((v) => v + 1);
      }
      set(next);
    },
    [set]
  );

  const begin = useCallback(() => {
    const current = compositionRef.current;
    if (!current) return;
    pending.current = current;
    past.current = [...past.current.slice(-(HISTORY - 1)), current];
    future.current = [];
    setHistoryVersion((v) => v + 1);
  }, []);

  const cancel = useCallback(() => {
    const before = pending.current;
    pending.current = null;
    if (!before || past.current.at(-1) !== before) return;
    past.current = past.current.slice(0, -1);
    setHistoryVersion((v) => v + 1);
    set(before);
  }, [set]);

  const discardIfUnchanged = useCallback(() => {
    const before = pending.current;
    pending.current = null;
    if (!before || past.current.at(-1) !== before) return;
    if (JSON.stringify(before.layers) !== JSON.stringify(compositionRef.current?.layers)) return;
    past.current = past.current.slice(0, -1);
    setHistoryVersion((v) => v + 1);
  }, []);

  const undo = useCallback(() => {
    const previous = past.current.at(-1);
    const current = compositionRef.current;
    if (!previous || !current) return;
    past.current = past.current.slice(0, -1);
    future.current = [current, ...future.current].slice(0, HISTORY);
    setHistoryVersion((v) => v + 1);
    set(previous);
  }, [set]);

  const redo = useCallback(() => {
    const next = future.current[0];
    const current = compositionRef.current;
    if (!next || !current) return;
    future.current = future.current.slice(1);
    past.current = [...past.current, current].slice(-HISTORY);
    setHistoryVersion((v) => v + 1);
    set(next);
  }, [set]);

  const image = useCallback((src: string | null | undefined) => {
    if (!src) return null;
    const found = cache.current.get(src);
    if (found instanceof HTMLImageElement) return found;
    if (!found) {
      cache.current.set(src, "loading");
      const element = new Image();
      element.decoding = "async";
      element.onload = () => {
        cache.current.set(src, element);
        setImageVersion((v) => v + 1);
      };
      element.onerror = () => cache.current.set(src, "failed");
      element.src = src;
    }
    return null;
  }, []);

  const track = useCallback((url: string) => {
    urls.current.add(url);
    return url;
  }, []);

  const images = useMemo<CosplanImages>(() => {
    const layers = new Map<string, HTMLImageElement>();
    for (const layer of composition?.layers ?? []) {
      if (layer.type !== "image") continue;
      const loaded = image(layer.src);
      if (loaded) layers.set(layer.id, loaded);
    }
    return { background: image(composition?.backgroundUrl), foreground: image(composition?.foregroundUrl), layers };
    // imageVersion: images that finished loading since the last render.
  }, [composition, image, imageVersion]);

  const value = useMemo<CosplanStudio>(
    () => ({
      templates,
      status,
      composition,
      apply,
      begin,
      cancel,
      discardIfUnchanged,
      undo,
      redo,
      canUndo: past.current.length > 0,
      canRedo: future.current.length > 0,
      saved,
      images,
      image,
      imageVersion,
      track
    }),
    // historyVersion: past and future are refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [templates, status, composition, apply, begin, cancel, discardIfUnchanged, undo, redo, saved, images, image, imageVersion, track, historyVersion]
  );

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}
