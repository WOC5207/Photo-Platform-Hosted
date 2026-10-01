"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  snapSharingPosterLayerCentre,
  type SharingPosterComposition,
  type SharingPosterResolvedPhoto
} from "@/lib/sharingPoster";
import {
  loadPosterImages,
  loadPosterLayerImages,
  renderSharingPoster,
  type SharingPosterRenderResult
} from "@/lib/sharingPosterCanvas";
import {
  cropRectToAnchor,
  resolvePosterCrop,
  snapCreditsPosition,
  type PosterLayoutRect,
  type PosterRect
} from "@/lib/sharingPosterLayout";

export default function SharingPosterCanvas({
  composition,
  photos,
  selectedPhotoId,
  onSelectPhoto,
  onCropChange,
  onCreditsMove,
  selectedLayerId,
  onSelectLayer,
  onLayerMove,
  onRenderMetrics,
  ariaLabel,
  unavailableLabel
}: {
  composition: SharingPosterComposition;
  photos: SharingPosterResolvedPhoto[];
  selectedPhotoId: string | null;
  onSelectPhoto: (id: string | null) => void;
  onCropChange: (id: string, crop: { mode: "manual"; x: number; y: number }) => void;
  /** The credits were dragged to `x` (0 left edge, 0.5 centre, 1 right edge of the photographs). */
  onCreditsMove: (x: number) => void;
  selectedLayerId: string | null;
  onSelectLayer: (id: string | null) => void;
  /** An image layer was dragged so its centre sits at `x`, `y` (fractions of the poster). */
  onLayerMove: (id: string, x: number, y: number) => void;
  onRenderMetrics: (result: SharingPosterRenderResult) => void;
  ariaLabel: string;
  unavailableLabel: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rectanglesRef = useRef<PosterLayoutRect[]>([]);
  const textRef = useRef<SharingPosterRenderResult["text"]>(null);
  const textDragRef = useRef<{ pointerId: number; x: number; startPosition: number; travel: number } | null>(null);
  const [textGuide, setTextGuide] = useState<0 | 0.5 | 1 | null>(null);
  const layerRectsRef = useRef<PosterLayoutRect[]>([]);
  const layerDragRef = useRef<{ pointerId: number; id: string; x: number; y: number; startX: number; startY: number } | null>(null);
  const [layerGuides, setLayerGuides] = useState<{ vertical: boolean; horizontal: boolean } | null>(null);
  const [layerImages, setLayerImages] = useState<Map<string, HTMLImageElement>>(new Map());
  const layerTokens = [...new Set((composition.layers ?? []).map((layer) => layer.token))].join("|");
  const cacheRef = useRef<{ key: string; rectangles: PosterLayoutRect[] } | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    id: string;
    x: number;
    y: number;
    /** The crop showing when the drag began, in image pixels. */
    startCrop: PosterRect;
    /** Image pixels per canvas pixel, so content follows the pointer 1:1. */
    scale: number;
    naturalWidth: number;
    naturalHeight: number;
  } | null>(null);
  const [images, setImages] = useState<Map<string, HTMLImageElement>>(new Map());
  const height = Math.max(
    180,
    Math.round((900 * composition.ratio.height) / composition.ratio.width)
  );
  const layoutKey = useMemo(
    () =>
      JSON.stringify({
        ratio: composition.ratio,
        style: composition.style,
        credits: composition.credits,
        photos: photos.map((photo) => ({
          id: photo.photoId,
          weight: photo.composition.weight,
          width: photo.source?.width,
          height: photo.source?.height,
          // The crop mode and, for auto crops, the subject shape the frames;
          // a manual anchor does not, so dragging never re-solves the mosaic.
          mode: photo.composition.crop?.mode ?? "legacy",
          subject: photo.composition.crop?.mode === "auto" ? photo.source?.subject ?? null : null
        }))
      }),
    [composition.ratio, composition.style, composition.credits, photos]
  );

  useEffect(() => {
    let cancelled = false;
    void loadPosterImages(photos, "preview").then((loaded) => {
      if (!cancelled) setImages(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [photos.map((photo) => `${photo.photoId}:${photo.source?.previewUrl ?? ""}`).join("|")]);

  useEffect(() => {
    let cancelled = false;
    void loadPosterLayerImages(composition.layers).then((loaded) => {
      if (!cancelled) setLayerImages(loaded);
    });
    return () => {
      cancelled = true;
    };
    // Reload only when the set of uploaded images changes, not on every move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerTokens]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const cached = cacheRef.current?.key === layoutKey ? cacheRef.current.rectangles : undefined;
    const result = renderSharingPoster(context, canvas.width, canvas.height, composition, photos, images, {
      selectedPhotoId,
      selectionColor: getComputedStyle(canvas).getPropertyValue("--accent").trim() || "#a44f25",
      rectangles: cached,
      unavailableLabel,
      subjectMarkerPhotoId: selectedPhotoId,
      textGuide,
      layerImages,
      selectedLayerId,
      layerGuides
    });
    rectanglesRef.current = result.rectangles;
    layerRectsRef.current = result.layerRects;
    textRef.current = result.text;
    cacheRef.current = { key: layoutKey, rectangles: result.rectangles };
    onRenderMetrics(result);
  }, [composition, photos, images, selectedPhotoId, layoutKey, onRenderMetrics, unavailableLabel, textGuide, layerImages, selectedLayerId, layerGuides]);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * canvas.width,
      y: ((event.clientY - bounds.top) / bounds.height) * canvas.height
    };
  }

  function overText(p: { x: number; y: number }): boolean {
    const text = textRef.current;
    // A little slack around the glyphs so thin text is easy to grab.
    const slack = 8;
    return Boolean(
      text &&
        p.x >= text.x - slack &&
        p.x <= text.x + text.width + slack &&
        p.y >= text.y - slack &&
        p.y <= text.y + text.height + slack
    );
  }

  function inside(p: { x: number; y: number }, rect: PosterRect): boolean {
    return p.x >= rect.x && p.x <= rect.x + rect.width && p.y >= rect.y && p.y <= rect.y + rect.height;
  }

  /** The topmost image layer under `p`; one behind the photographs only where no photograph covers it. */
  function layerAt(p: { x: number; y: number }): string | null {
    const placement = new Map((composition.layers ?? []).map((layer) => [layer.id, layer.placement]));
    const hits = [...layerRectsRef.current].reverse().filter((rect) => inside(p, rect));
    const front = hits.find((rect) => placement.get(rect.id) === "front");
    if (front) return front.id;
    if (overText(p) || rectanglesRef.current.some((rect) => inside(p, rect))) return null;
    return hits[0]?.id ?? null;
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const p = point(event);
    const layerId = layerAt(p);
    const layer = composition.layers?.find((candidate) => candidate.id === layerId);
    if (layer) {
      onSelectLayer(layer.id);
      event.currentTarget.setPointerCapture(event.pointerId);
      layerDragRef.current = { pointerId: event.pointerId, id: layer.id, x: p.x, y: p.y, startX: layer.x, startY: layer.y };
      return;
    }
    const text = textRef.current;
    if (text && overText(p)) {
      event.currentTarget.setPointerCapture(event.pointerId);
      textDragRef.current = {
        pointerId: event.pointerId,
        x: p.x,
        startPosition: composition.style.creditsX ?? 0,
        travel: text.travel
      };
      return;
    }
    const rect = [...rectanglesRef.current]
      .reverse()
      .find((candidate) =>
        p.x >= candidate.x &&
        p.x <= candidate.x + candidate.width &&
        p.y >= candidate.y &&
        p.y <= candidate.y + candidate.height
      );
    onSelectPhoto(rect?.id ?? null);
    // A whole photograph has no crop to drag.
    if (!rect || (composition.style.fit ?? "fill") !== "fill") return;
    const photo = photos.find((candidate) => candidate.photoId === rect.id);
    const image = images.get(rect.id);
    if (!photo?.source || !image?.complete || image.naturalWidth === 0) return;
    const startCrop = resolvePosterCrop(
      photo.composition,
      photo.source.subject,
      image.naturalWidth,
      image.naturalHeight,
      rect.width,
      rect.height
    );
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      id: rect.id,
      x: p.x,
      y: p.y,
      startCrop,
      scale: startCrop.width / rect.width,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight
    };
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const layerDrag = layerDragRef.current;
    if (layerDrag && layerDrag.pointerId === event.pointerId) {
      const canvas = canvasRef.current!;
      const p = point(event);
      // Snap within about 2% of the poster's width of either centre line.
      const x = snapSharingPosterLayerCentre(layerDrag.startX + (p.x - layerDrag.x) / canvas.width, 0.02);
      const y = snapSharingPosterLayerCentre(layerDrag.startY + (p.y - layerDrag.y) / canvas.height, (0.02 * canvas.width) / canvas.height);
      setLayerGuides(x.snapped || y.snapped ? { vertical: x.snapped, horizontal: y.snapped } : null);
      onLayerMove(layerDrag.id, Math.round(x.value * 10000) / 10000, Math.round(y.value * 10000) / 10000);
      return;
    }
    const textDrag = textDragRef.current;
    if (textDrag && textDrag.pointerId === event.pointerId) {
      const p = point(event);
      const raw = textDrag.travel > 0 ? textDrag.startPosition + (p.x - textDrag.x) / textDrag.travel : 0;
      // Snap within about 2% of the poster's width of an alignment.
      const snap = snapCreditsPosition(raw, textDrag.travel, (canvasRef.current?.width ?? 900) * 0.02);
      setTextGuide(snap.snapped);
      onCreditsMove(Math.round(snap.position * 1000) / 1000);
      return;
    }
    if (!dragRef.current) {
      const p = point(event);
      event.currentTarget.style.cursor = layerAt(p) ? "move" : overText(p) ? "ew-resize" : "";
    }
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const p = point(event);
    // Moving the pointer moves the image under the frame by the same distance.
    const x = Math.min(
      Math.max(drag.startCrop.x - (p.x - drag.x) * drag.scale, 0),
      Math.max(0, drag.naturalWidth - drag.startCrop.width)
    );
    const y = Math.min(
      Math.max(drag.startCrop.y - (p.y - drag.y) * drag.scale, 0),
      Math.max(0, drag.naturalHeight - drag.startCrop.height)
    );
    const anchor = cropRectToAnchor({ ...drag.startCrop, x, y }, drag.naturalWidth, drag.naturalHeight);
    onCropChange(drag.id, { mode: "manual", x: anchor.x, y: anchor.y });
  }

  function endDrag(event: React.PointerEvent<HTMLCanvasElement>) {
    if (layerDragRef.current?.pointerId === event.pointerId) {
      layerDragRef.current = null;
      setLayerGuides(null);
    }
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
    if (textDragRef.current?.pointerId === event.pointerId) {
      textDragRef.current = null;
      setTextGuide(null);
    }
  }

  return (
    <canvas
      ref={canvasRef}
      width={900}
      height={height}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      aria-label={ariaLabel}
      className="ui-image-frame block max-h-[44dvh] max-w-full touch-none bg-white shadow-[0_16px_40px_rgb(0_0_0/0.12)] lg:max-h-[calc(100dvh-12rem)]"
      style={{ aspectRatio: `${composition.ratio.width} / ${composition.ratio.height}` }}
    />
  );
}
