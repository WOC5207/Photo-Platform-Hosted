export type CosplanPoint = {
  x: number;
  y: number;
};

export type CosplanSlotShape = {
  type: "polygon";
  /** Points are normalized to the slot bounds. The first contour is the
   * opening; later contours are preserved cut-outs such as printed labels. */
  contours: CosplanPoint[][];
};

export type CosplanSlot = {
  id: string;
  nameEn: string;
  nameZh: string;
  x: number;
  y: number;
  width: number;
  height: number;
  shape?: CosplanSlotShape;
};

export type CosplanDetectionPreset = "strict" | "standard" | "loose";

export type CosplanSlotCandidate = Omit<CosplanSlot, "nameEn" | "nameZh"> & {
  quality: "recommended" | "review";
  reasons: Array<"edge" | "irregular" | "large">;
};

export type CosplanTemplateSummary = {
  id: string;
  title: string;
  titleEn: string;
  titleZh: string;
  assetToken: string;
  imageUrl: string;
  foregroundToken: string | null;
  foregroundUrl: string | null;
  layoutVersion: number;
  slots: CosplanSlot[];
  width: number;
  height: number;
};

export type CosplanImageLayer = {
  id: string;
  type: "image";
  name: string;
  src: string;
  blob?: Blob;
  sourceUrl?: string;
  slotId?: string;
  slot?: CosplanSlot;
  drawForeground?: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
};

export type CosplanTextLayer = {
  id: string;
  type: "text";
  name: string;
  text: string;
  x: number;
  y: number;
  width: number;
  rotation: number;
  fontSize: number;
  fill: string;
  align: "left" | "center" | "right";
  bold: boolean;
  fontFamily: string;
};

export type CosplanLayer = CosplanImageLayer | CosplanTextLayer;

export type CosplanComposition = {
  version: 1 | 2;
  templateId: string;
  templateTitle: string;
  assetToken: string;
  backgroundUrl: string;
  foregroundToken?: string | null;
  foregroundUrl?: string | null;
  layoutVersion?: number;
  slots?: CosplanSlot[];
  width: number;
  height: number;
  layers: CosplanLayer[];
  updatedAt: number;
};

const SLOT_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const COSPLAN_SLOT_LIMIT = 12;
const COSPLAN_SLOT_CONTOUR_LIMIT = 8;
const COSPLAN_SLOT_POINT_LIMIT = 96;

function signedPolygonArea(points: CosplanPoint[]) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return area / 2;
}

function parseCosplanSlotShape(value: unknown): CosplanSlotShape | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  if (raw.type !== "polygon" || !Array.isArray(raw.contours)) return undefined;
  if (raw.contours.length === 0 || raw.contours.length > COSPLAN_SLOT_CONTOUR_LIMIT) return undefined;
  const contours: CosplanPoint[][] = [];
  for (const rawContour of raw.contours.slice(0, COSPLAN_SLOT_CONTOUR_LIMIT)) {
    if (!Array.isArray(rawContour) || rawContour.length < 3 || rawContour.length > COSPLAN_SLOT_POINT_LIMIT) return undefined;
    const contour: CosplanPoint[] = [];
    for (const rawPoint of rawContour) {
      if (!rawPoint || typeof rawPoint !== "object") return undefined;
      const point = rawPoint as Record<string, unknown>;
      const x = Number(point.x);
      const y = Number(point.y);
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return undefined;
      contour.push({ x: Math.round(x * 100_000) / 100_000, y: Math.round(y * 100_000) / 100_000 });
    }
    if (Math.abs(signedPolygonArea(contour)) < 0.0001) return undefined;
    contours.push(contour);
  }
  return contours.length ? { type: "polygon", contours } : undefined;
}

export function parseCosplanSlots(value: unknown, canvasWidth: number, canvasHeight: number): CosplanSlot[] {
  if (!Array.isArray(value) || !Number.isInteger(canvasWidth) || !Number.isInteger(canvasHeight)) return [];
  const slots: CosplanSlot[] = [];
  const ids = new Set<string>();
  for (const candidate of value.slice(0, COSPLAN_SLOT_LIMIT)) {
    if (!candidate || typeof candidate !== "object") continue;
    const raw = candidate as Record<string, unknown>;
    const id = typeof raw.id === "string" ? raw.id.trim().toLowerCase() : "";
    const nameEn = typeof raw.nameEn === "string" ? raw.nameEn.trim().slice(0, 60) : "";
    const nameZh = typeof raw.nameZh === "string" ? raw.nameZh.trim().slice(0, 60) : "";
    const x = Math.round(Number(raw.x));
    const y = Math.round(Number(raw.y));
    const width = Math.round(Number(raw.width));
    const height = Math.round(Number(raw.height));
    if (!SLOT_ID.test(id) || ids.has(id) || !nameEn || !nameZh) continue;
    if (![x, y, width, height].every(Number.isFinite) || width < 24 || height < 24) continue;
    if (x < 0 || y < 0 || x + width > canvasWidth || y + height > canvasHeight) continue;
    const hasShape = raw.shape !== undefined && raw.shape !== null;
    const shape = parseCosplanSlotShape(raw.shape);
    if (hasShape && !shape) continue;
    ids.add(id);
    slots.push({ id, nameEn, nameZh, x, y, width, height, ...(shape ? { shape } : {}) });
  }
  return slots;
}

export function scaleCosplanSlots(
  slots: CosplanSlot[],
  fromWidth: number,
  fromHeight: number,
  toWidth: number,
  toHeight: number
): CosplanSlot[] {
  if (!fromWidth || !fromHeight) return [];
  const scaleX = toWidth / fromWidth;
  const scaleY = toHeight / fromHeight;
  return parseCosplanSlots(
    slots.map((slot) => ({
      ...slot,
      x: slot.x * scaleX,
      y: slot.y * scaleY,
      width: slot.width * scaleX,
      height: slot.height * scaleY
    })),
    toWidth,
    toHeight
  );
}

/**
 * Preserves the fixed poster strata while allowing user ordering within the
 * character and text groups. The foreground is drawn once after all images.
 */
export function normalizeCosplanLayerOrder(layers: CosplanLayer[]): CosplanLayer[] {
  const images = layers.filter((layer): layer is CosplanImageLayer => layer.type === "image");
  const texts = layers.filter((layer): layer is CosplanTextLayer => layer.type === "text");
  return [
    ...images.map((layer, index) => ({ ...layer, drawForeground: index === images.length - 1 })),
    ...texts
  ];
}
