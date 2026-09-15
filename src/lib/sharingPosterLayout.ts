import { homePhotoWeightScale } from "@/lib/homePhotoWeight";

export interface PosterRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PosterLayoutInput {
  id: string;
  width: number;
  height: number;
  weight: number;
}

export interface PosterLayoutRect extends PosterRect {
  id: string;
}

interface Candidate {
  cost: number;
  rectangles: PosterLayoutRect[];
}

function cropCost(item: PosterLayoutInput, rect: PosterRect): number {
  const imageAspect = Math.max(0.01, item.width / Math.max(1, item.height));
  const frameAspect = Math.max(0.01, rect.width / Math.max(1, rect.height));
  const retained = Math.min(imageAspect / frameAspect, frameAspect / imageAspect);
  return -Math.log(Math.max(0.01, retained)) * homePhotoWeightScale(item.weight);
}

function better(current: Candidate | null, next: Candidate): Candidate {
  if (!current || next.cost < current.cost - 0.000001) return next;
  return current;
}

/**
 * Deterministic, bounded weighted partitioning for at most nine photographs.
 * Every candidate preserves input order, while each split evaluates both axes
 * and chooses the crop-friendly result. Divider gaps are removed exactly once,
 * so frames never overlap or escape the supplied rectangle.
 */
export function calculateSharingPosterLayout(
  items: PosterLayoutInput[],
  area: PosterRect,
  gap: number
): PosterLayoutRect[] {
  if (items.length === 0 || area.width <= 0 || area.height <= 0) return [];
  const safeGap = Math.max(0, gap);

  function solve(start: number, end: number, rect: PosterRect): Candidate {
    if (end - start === 1) {
      return {
        cost: cropCost(items[start], rect),
        rectangles: [{ ...rect, id: items[start].id }]
      };
    }

    let best: Candidate | null = null;
    const totalWeight = items
      .slice(start, end)
      .reduce((sum, item) => sum + homePhotoWeightScale(item.weight), 0);

    for (let split = start + 1; split < end; split += 1) {
      const firstWeight = items
        .slice(start, split)
        .reduce((sum, item) => sum + homePhotoWeightScale(item.weight), 0);
      const share = firstWeight / totalWeight;

      if (rect.width > safeGap + 1) {
        const usable = rect.width - safeGap;
        const firstWidth = usable * share;
        const left = solve(start, split, {
          x: rect.x,
          y: rect.y,
          width: firstWidth,
          height: rect.height
        });
        const right = solve(split, end, {
          x: rect.x + firstWidth + safeGap,
          y: rect.y,
          width: usable - firstWidth,
          height: rect.height
        });
        best = better(best, {
          cost: left.cost + right.cost,
          rectangles: [...left.rectangles, ...right.rectangles]
        });
      }

      if (rect.height > safeGap + 1) {
        const usable = rect.height - safeGap;
        const firstHeight = usable * share;
        const top = solve(start, split, {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: firstHeight
        });
        const bottom = solve(split, end, {
          x: rect.x,
          y: rect.y + firstHeight + safeGap,
          width: rect.width,
          height: usable - firstHeight
        });
        best = better(best, {
          cost: top.cost + bottom.cost,
          rectangles: [...top.rectangles, ...bottom.rectangles]
        });
      }
    }

    return best ?? {
      cost: Number.POSITIVE_INFINITY,
      rectangles: items.slice(start, end).map((item) => ({ ...rect, id: item.id }))
    };
  }

  return solve(0, items.length, area).rectangles;
}

export function coverCropSource(
  imageWidth: number,
  imageHeight: number,
  frameWidth: number,
  frameHeight: number,
  focalX: number,
  focalY: number
): PosterRect {
  const imageAspect = imageWidth / Math.max(1, imageHeight);
  const frameAspect = frameWidth / Math.max(1, frameHeight);
  let width = imageWidth;
  let height = imageHeight;
  if (imageAspect > frameAspect) width = imageHeight * frameAspect;
  else height = imageWidth / frameAspect;
  const maxX = Math.max(0, imageWidth - width);
  const maxY = Math.max(0, imageHeight - height);
  return {
    x: maxX * Math.min(1, Math.max(0, focalX)),
    y: maxY * Math.min(1, Math.max(0, focalY)),
    width,
    height
  };
}
