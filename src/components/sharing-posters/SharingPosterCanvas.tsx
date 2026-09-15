"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  SharingPosterComposition,
  SharingPosterResolvedPhoto
} from "@/lib/sharingPoster";
import {
  loadPosterImages,
  renderSharingPoster,
  type SharingPosterRenderResult
} from "@/lib/sharingPosterCanvas";
import type { PosterLayoutRect } from "@/lib/sharingPosterLayout";

export default function SharingPosterCanvas({
  composition,
  photos,
  selectedPhotoId,
  onSelectPhoto,
  onFocalChange,
  onRenderMetrics,
  ariaLabel,
  unavailableLabel
}: {
  composition: SharingPosterComposition;
  photos: SharingPosterResolvedPhoto[];
  selectedPhotoId: string | null;
  onSelectPhoto: (id: string | null) => void;
  onFocalChange: (id: string, focalX: number, focalY: number) => void;
  onRenderMetrics: (result: SharingPosterRenderResult) => void;
  ariaLabel: string;
  unavailableLabel: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rectanglesRef = useRef<PosterLayoutRect[]>([]);
  const cacheRef = useRef<{ key: string; rectangles: PosterLayoutRect[] } | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    id: string;
    x: number;
    y: number;
    focalX: number;
    focalY: number;
    rect: PosterLayoutRect;
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
          height: photo.source?.height
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
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const cached = cacheRef.current?.key === layoutKey ? cacheRef.current.rectangles : undefined;
    const result = renderSharingPoster(context, canvas.width, canvas.height, composition, photos, images, {
      selectedPhotoId,
      selectionColor: getComputedStyle(canvas).getPropertyValue("--accent").trim() || "#a44f25",
      rectangles: cached,
      unavailableLabel
    });
    rectanglesRef.current = result.rectangles;
    cacheRef.current = { key: layoutKey, rectangles: result.rectangles };
    onRenderMetrics(result);
  }, [composition, photos, images, selectedPhotoId, layoutKey, onRenderMetrics, unavailableLabel]);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * canvas.width,
      y: ((event.clientY - bounds.top) / bounds.height) * canvas.height
    };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const p = point(event);
    const rect = [...rectanglesRef.current]
      .reverse()
      .find((candidate) =>
        p.x >= candidate.x &&
        p.x <= candidate.x + candidate.width &&
        p.y >= candidate.y &&
        p.y <= candidate.y + candidate.height
      );
    onSelectPhoto(rect?.id ?? null);
    if (!rect) return;
    const photo = photos.find((candidate) => candidate.photoId === rect.id);
    if (!photo) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      id: rect.id,
      x: p.x,
      y: p.y,
      focalX: photo.composition.focalX,
      focalY: photo.composition.focalY,
      rect
    };
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const p = point(event);
    const focalX = Math.min(1, Math.max(0, drag.focalX - (p.x - drag.x) / drag.rect.width));
    const focalY = Math.min(1, Math.max(0, drag.focalY - (p.y - drag.y) / drag.rect.height));
    onFocalChange(drag.id, focalX, focalY);
  }

  function endDrag(event: React.PointerEvent<HTMLCanvasElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
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
