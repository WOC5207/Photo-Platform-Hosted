import { useEffect, useRef } from "react";
import type { SharingPosterComposition } from "@/lib/sharingPoster";
import type { PosterStage } from "../../poster";
import type { Metrics, SharepostStudio } from "./SharepostStudio";

/** The Sharepost poster on the easel, repainted at most once a frame as the draft changes. */
export function useMatPaint(
  scene: PosterStage | null,
  studio: SharepostStudio,
  options: { selected?: string | null; composition?: SharingPosterComposition | null; key?: string; blank: (canvas: HTMLCanvasElement) => void }
) {
  const blank = useRef(options.blank);
  blank.current = options.blank;
  const { paint, status, composition, photos } = studio;
  const shown = options.composition ?? composition;
  useEffect(() => {
    if (!scene || status !== "ready") return;
    const frame = requestAnimationFrame(() => {
      if (!shown || shown.photos.length === 0 || photos.length === 0) {
        blank.current(scene.setPoster("sharepost:none", 0.8));
        scene.refresh();
        return;
      }
      paint(scene, { selected: options.selected, composition: options.composition ?? undefined, key: options.key });
    });
    return () => cancelAnimationFrame(frame);
  }, [scene, status, shown, photos.length, paint, options.selected, options.composition, options.key]);
}

/** Canvas pixels on the easel's poster under a pointer, or null off it. */
export function matPoint(scene: PosterStage, metrics: Metrics, clientX: number, clientY: number, rect: DOMRect, extend = false) {
  const uv = scene.posterPoint(clientX, clientY, rect, extend);
  return uv ? { x: uv.u * metrics.width, y: uv.v * metrics.height } : null;
}

/** The photograph drawn under a pointer. */
export function photoAt(scene: PosterStage, metrics: Metrics, clientX: number, clientY: number, rect: DOMRect): string | null {
  const at = matPoint(scene, metrics, clientX, clientY, rect);
  if (!at) return null;
  return metrics.photoRects.find((box) => at.x >= box.x && at.x <= box.x + box.width && at.y >= box.y && at.y <= box.y + box.height)?.id ?? null;
}
