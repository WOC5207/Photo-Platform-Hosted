import { cosplanTextHeight } from "@/lib/cosplanCanvas";
import type { CosplanComposition, CosplanImageLayer, CosplanLayer, CosplanSlot, CosplanTextLayer } from "@/lib/cosplanTypes";

/**
 * Geometry and guides for the 3D Cosplan board: where each layer sits (as
 * Konva places it, rotated about its top-left corner), which one a point on
 * the poster lands on, and the slot glows and selection frame painted over
 * the easel's poster. None of this reaches the download.
 */

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Degrees, about (x, y). */
  rotation: number;
}

let measure: CanvasRenderingContext2D | null = null;
function measuring(): CanvasRenderingContext2D | null {
  if (!measure) measure = document.createElement("canvas").getContext("2d");
  return measure;
}

export function layerBox(layer: CosplanLayer): Box {
  if (layer.type === "image") return { x: layer.x, y: layer.y, width: layer.width, height: layer.height, rotation: layer.rotation };
  const ctx = measuring();
  return { x: layer.x, y: layer.y, width: layer.width, height: ctx ? cosplanTextHeight(ctx, layer) : layer.fontSize * 1.15, rotation: layer.rotation };
}

const radians = (degrees: number) => (degrees * Math.PI) / 180;

/** A point in the box's own unrotated coordinates. */
function local(box: Box, x: number, y: number) {
  const a = -radians(box.rotation);
  const dx = x - box.x;
  const dy = y - box.y;
  return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
}

export function centre(box: Box) {
  const a = radians(box.rotation);
  const hx = box.width / 2;
  const hy = box.height / 2;
  return { x: box.x + hx * Math.cos(a) - hy * Math.sin(a), y: box.y + hx * Math.sin(a) + hy * Math.cos(a) };
}

function inSlot(slot: CosplanSlot, x: number, y: number) {
  return x >= slot.x && x <= slot.x + slot.width && y >= slot.y && y <= slot.y + slot.height;
}

/** The uppermost layer drawn at a poster point (a character only where its slot shows it). */
export function layerAt(composition: CosplanComposition, x: number, y: number): CosplanLayer | null {
  for (let i = composition.layers.length - 1; i >= 0; i -= 1) {
    const layer = composition.layers[i];
    const box = layerBox(layer);
    const p = local(box, x, y);
    if (p.x < 0 || p.y < 0 || p.x > box.width || p.y > box.height) continue;
    const slot = layer.type === "image" ? (layer.slot ?? composition.slots?.find((item) => item.id === layer.slotId)) : undefined;
    if (slot && !inSlot(slot, x, y)) continue;
    return layer;
  }
  return null;
}

export function slotAt(composition: CosplanComposition, x: number, y: number): CosplanSlot | null {
  return composition.slots?.find((slot) => inSlot(slot, x, y)) ?? null;
}

/**
 * The layer sized by `factor` and turned by `turn` degrees about its centre,
 * within the classic editor's limits.
 */
export function transformLayer(layer: CosplanLayer, factor: number, turn: number): Partial<CosplanLayer> {
  const box = layerBox(layer);
  const middle = centre(box);
  const rotation = ((((layer.rotation + turn + 180) % 360) + 360) % 360) - 180;
  if (layer.type === "image") {
    const scale = Math.max(24 / Math.min(layer.width, layer.height), factor);
    const width = layer.width * scale;
    const height = layer.height * scale;
    const at = corner(middle, width, height, rotation);
    return { x: at.x, y: at.y, width, height, rotation } satisfies Partial<CosplanImageLayer>;
  }
  const scale = Math.max(10 / layer.fontSize, 80 / layer.width, factor);
  const width = layer.width * scale;
  const at = corner(middle, width, box.height * scale, rotation);
  return { x: at.x, y: at.y, width, fontSize: layer.fontSize * scale, rotation } satisfies Partial<CosplanTextLayer>;
}

/** The top-left corner that puts a box of this size and rotation on `middle`. */
function corner(middle: { x: number; y: number }, width: number, height: number, rotation: number) {
  const a = radians(rotation);
  const hx = width / 2;
  const hy = height / 2;
  return { x: middle.x - (hx * Math.cos(a) - hy * Math.sin(a)), y: middle.y - (hx * Math.sin(a) + hy * Math.cos(a)) };
}

function slotPath(ctx: CanvasRenderingContext2D, slot: CosplanSlot) {
  ctx.beginPath();
  const outline = slot.shape?.contours[0];
  if (!outline) {
    ctx.rect(slot.x, slot.y, slot.width, slot.height);
    return;
  }
  outline.forEach((point, index) => {
    const x = slot.x + point.x * slot.width;
    const y = slot.y + point.y * slot.height;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
}

/**
 * Glows on the empty slots (with their names), a ring on the focused slot and
 * a frame with corner handles on the selected layer, in poster pixels times
 * `scale`.
 */
export function paintGuides(
  ctx: CanvasRenderingContext2D,
  composition: CosplanComposition,
  scale: number,
  options: { accent: string; locale: string; focusSlot: string | null; selected: CosplanLayer | null; slots: boolean }
) {
  const unit = Math.max(composition.width, composition.height) / 400;
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  if (options.slots) {
    const filled = new Set(composition.layers.flatMap((layer) => (layer.type === "image" && layer.slotId ? [layer.slotId] : [])));
    for (const slot of composition.slots ?? []) {
      const empty = !filled.has(slot.id);
      const focused = slot.id === options.focusSlot;
      if (!empty && !focused) continue;
      slotPath(ctx, slot);
      if (empty) {
        ctx.fillStyle = withAlpha(options.accent, focused ? 0.28 : 0.14);
        ctx.fill();
      }
      ctx.lineWidth = unit * (focused ? 2.4 : 1.2);
      ctx.setLineDash(focused ? [] : [unit * 4, unit * 3]);
      ctx.strokeStyle = options.accent;
      ctx.stroke();
      ctx.setLineDash([]);
      if (empty || focused) {
        const label = (options.locale === "zh" ? slot.nameZh : slot.nameEn).toUpperCase();
        const size = Math.max(unit * 5, Math.min(slot.width / 9, unit * 11));
        ctx.font = `700 ${size}px ui-monospace, SFMono-Regular, Menlo, monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const x = slot.x + slot.width / 2;
        const y = slot.y + (empty ? slot.height / 2 : slot.height - size);
        const width = Math.min(slot.width - unit * 4, ctx.measureText(label).width + size);
        ctx.fillStyle = options.accent;
        ctx.fillRect(x - width / 2, y - size * 0.8, width, size * 1.6);
        ctx.fillStyle = "#fff";
        ctx.fillText(label, x, y, width - size * 0.6);
      }
    }
  }
  if (options.selected) {
    const box = layerBox(options.selected);
    ctx.translate(box.x, box.y);
    ctx.rotate(radians(box.rotation));
    ctx.lineWidth = unit * 1.6;
    ctx.strokeStyle = options.accent;
    ctx.strokeRect(0, 0, box.width, box.height);
    const handle = unit * 5;
    ctx.fillStyle = "#fff";
    for (const [hx, hy] of [[0, 0], [box.width, 0], [0, box.height], [box.width, box.height]]) {
      ctx.fillRect(hx - handle / 2, hy - handle / 2, handle, handle);
      ctx.strokeRect(hx - handle / 2, hy - handle / 2, handle, handle);
    }
  }
  ctx.restore();
}

/** rgb(r, g, b) or #rrggbb with an alpha. */
export function withAlpha(color: string, alpha: number) {
  const rgb = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgb) return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`;
  const hex = color.trim().match(/^#([0-9a-f]{6})$/i)?.[1];
  const n = hex ? Number.parseInt(hex, 16) : 0xc2572b;
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
