import { cosplanCharacterNames, type CosplanComposition, type CosplanImageLayer, type CosplanSlot, type CosplanTextLayer } from "./cosplanTypes";

/**
 * Paints a Cosplan poster on a plain 2D canvas, for the 3D site's easel and
 * its download. The classic editor draws the same poster with Konva; this
 * follows Konva's drawing steps one for one (draw order, slot clips, crop,
 * rotation about the top-left corner, and Konva's text wrapping and
 * baseline), so both give the same file. scripts/test-cosplan-render.ts
 * paints a fixture both ways and compares the pixels.
 */

export type CosplanImage = HTMLImageElement | ImageBitmap | HTMLCanvasElement;

export interface CosplanImages {
  background: CosplanImage | null;
  foreground: CosplanImage | null;
  /** By layer id; a missing image is skipped, as Konva skips one still loading. */
  layers: Map<string, CosplanImage>;
}

function naturalSize(image: CosplanImage) {
  return image instanceof HTMLImageElement ? { width: image.naturalWidth, height: image.naturalHeight } : { width: image.width, height: image.height };
}

// Konva quotes family names that contain spaces.
function fontFamily(family: string) {
  return family
    .split(",")
    .map((name) => {
      const trimmed = name.trim();
      return trimmed.includes(" ") && !/["']/.test(trimmed) ? `"${trimmed}"` : trimmed;
    })
    .join(", ");
}

function font(bold: boolean, size: number, family: string) {
  return `${bold ? "bold" : "normal"} normal ${size}px ${fontFamily(family)}`;
}

const segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
function graphemes(text: string): string[] {
  if (!segmenter) return text.match(/\p{RI}\p{RI}|\P{M}(?:\p{M}|\p{Emoji_Modifier}|️|‍\P{M})*|\p{M}+/gu) ?? [];
  return Array.from(segmenter.segment(text), (s) => s.segment);
}

interface TextBox {
  text: string;
  /** Font size in poster pixels. */
  size: number;
  family: string;
  bold: boolean;
  fill: string;
  align: "left" | "center" | "right";
  lineHeight: number;
  padding: number;
  /** Undefined: as wide as the text. */
  width?: number;
  /** Undefined: as tall as the text. */
  height?: number;
  wrap: "word" | "none";
  verticalAlign: "top" | "middle";
}

/** Konva's Text line breaking (_setTextData), without ellipsis or letter spacing. */
function textLines(ctx: CanvasRenderingContext2D, box: TextBox): { text: string; width: number }[] {
  const measure = (text: string) => ctx.measureText(text).width;
  const lineHeightPx = box.lineHeight * box.size;
  const maxWidth = box.width === undefined ? Infinity : box.width - box.padding * 2;
  const maxHeight = box.height === undefined ? Infinity : box.height - box.padding * 2;
  const wrapping = box.wrap !== "none";
  const lines: { text: string; width: number }[] = [];
  const add = (text: string) => lines.push({ text, width: measure(text) });
  let height = 0;
  for (const paragraph of box.text.split("\n")) {
    const paragraphWidth = measure(paragraph);
    if (paragraphWidth > maxWidth) {
      const chars = graphemes(paragraph);
      const length = chars.length;
      let start = 0;
      const slice = (end: number) => chars.slice(start, end).join("");
      const isBreak = (char: string) => char === " " || char === "-";
      const perLine = Math.max(1, Math.ceil((length * maxWidth) / paragraphWidth));
      while (start < length) {
        const fits = (end: number) => measure(slice(end)) <= maxWidth;
        let low = start;
        let high = Math.min(length, start + perLine);
        while (fits(high)) {
          low = high;
          if (high === length) break;
          high = Math.min(length, high + (high - start));
        }
        while (high - low > 1) {
          const mid = (low + high) >>> 1;
          if (fits(mid)) low = mid;
          else high = mid;
        }
        if (low === start) break;
        if (low === length) {
          add(slice(length));
          height += lineHeightPx;
          break;
        }
        if (wrapping && !isBreak(chars[low])) {
          let at = low - 1;
          while (at >= start && !isBreak(chars[at])) at--;
          if (at >= start) low = at + 1;
        }
        add(slice(low).trimEnd());
        height += lineHeightPx;
        if (!wrapping || height + lineHeightPx > maxHeight) break;
        start = low;
        while (start < length && !chars[start].trim()) start++;
      }
    } else {
      add(paragraph);
      height += lineHeightPx;
    }
    if (height + lineHeightPx > maxHeight) break;
  }
  return lines;
}

/** Konva's Text drawing (_sceneFunc), in the box's own coordinates. */
function drawText(ctx: CanvasRenderingContext2D, box: TextBox) {
  if (!box.text) return;
  ctx.font = font(box.bold, box.size, box.family);
  const lines = textLines(ctx, box);
  const lineHeightPx = box.lineHeight * box.size;
  const widest = Math.max(0, ...lines.map((line) => line.width));
  const totalWidth = box.width ?? widest + box.padding * 2;
  const totalHeight = box.height ?? lines.length * lineHeightPx + box.padding * 2;
  const metrics = ctx.measureText("M");
  const ascent = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent;
  const descent = metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent;
  let baseline = (ascent - descent) / 2 + lineHeightPx / 2;
  const alignY = box.verticalAlign === "middle" ? (totalHeight - lines.length * lineHeightPx - box.padding * 2) / 2 : 0;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = box.fill;
  ctx.translate(box.padding, alignY + box.padding);
  for (const line of lines) {
    const x = box.align === "right" ? totalWidth - line.width - box.padding * 2 : box.align === "center" ? (totalWidth - line.width - box.padding * 2) / 2 : 0;
    ctx.fillText(line.text, x, baseline);
    if (lines.length > 1) baseline += lineHeightPx;
  }
}

function clipToSlot(ctx: CanvasRenderingContext2D, slot: CosplanSlot) {
  ctx.beginPath();
  if (!slot.shape) ctx.rect(slot.x, slot.y, slot.width, slot.height);
  else {
    for (const contour of slot.shape.contours) {
      contour.forEach((point, index) => {
        const x = slot.x + point.x * slot.width;
        const y = slot.y + point.y * slot.height;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
    }
  }
  ctx.clip();
}

function drawCharacter(ctx: CanvasRenderingContext2D, layer: CosplanImageLayer, image: CosplanImage) {
  const size = naturalSize(image);
  ctx.translate(layer.x, layer.y);
  if (layer.rotation) ctx.rotate((layer.rotation * Math.PI) / 180);
  ctx.drawImage(image, size.width * layer.cropX, size.height * layer.cropY, size.width * layer.cropWidth, size.height * layer.cropHeight, 0, 0, layer.width, layer.height);
}

/** The character-name size the classic editor fits into a slot's name box. */
function nameSize(ctx: CanvasRenderingContext2D, text: string, field: { fontSize: number; width: number; height: number; bold: boolean }) {
  ctx.font = font(field.bold, field.fontSize, "Arial");
  const measured = ctx.measureText(text).width;
  return Math.min(field.fontSize, Math.max(1, field.height - 4) / 1.15, (field.fontSize * Math.max(1, field.width - 4)) / Math.max(1, measured));
}

/** One piece of a poster, for the 3D site's taken-apart view. */
export type CosplanPart = { kind: "background" } | { kind: "layer"; id: string } | { kind: "foreground" } | { kind: "names" };

function textBox(layer: CosplanTextLayer): TextBox {
  return { text: layer.text, size: layer.fontSize, family: layer.fontFamily, bold: layer.bold, fill: layer.fill, align: layer.align, lineHeight: 1.15, padding: 0, width: layer.width, wrap: "word", verticalAlign: "top" };
}

/** How tall a text layer is drawn, in poster pixels (Konva's height for its wrapped lines). */
export function cosplanTextHeight(ctx: CanvasRenderingContext2D, layer: CosplanTextLayer): number {
  ctx.save();
  ctx.font = font(layer.bold, layer.fontSize, layer.fontFamily);
  const lines = layer.text ? textLines(ctx, textBox(layer)).length : 1;
  ctx.restore();
  return Math.max(1, lines) * layer.fontSize * 1.15;
}

function paintLayer(ctx: CanvasRenderingContext2D, composition: CosplanComposition, images: CosplanImages, id: string, foreground: boolean) {
  const layer = composition.layers.find((item) => item.id === id);
  if (!layer) return;
  ctx.save();
  if (layer.type === "image") {
    const image = images.layers.get(layer.id);
    const slot = layer.slot ?? composition.slots?.find((item) => item.id === layer.slotId);
    if (image) {
      if (slot) clipToSlot(ctx, slot);
      drawCharacter(ctx, layer, image);
    }
    ctx.restore();
    if (foreground && layer.drawForeground && images.foreground) ctx.drawImage(images.foreground, 0, 0, composition.width, composition.height);
    return;
  }
  ctx.translate(layer.x, layer.y);
  if (layer.rotation) ctx.rotate((layer.rotation * Math.PI) / 180);
  drawText(ctx, textBox(layer));
  ctx.restore();
}

function paintNames(ctx: CanvasRenderingContext2D, composition: CosplanComposition) {
  for (const field of cosplanCharacterNames(composition.slots ?? [], composition.layers)) {
    const text = field.text.replace(/\s+/g, " ");
    ctx.save();
    const size = nameSize(ctx, text, field);
    ctx.translate(field.x, field.y);
    drawText(ctx, { text, size, family: "Arial", bold: field.bold, fill: field.fill, align: field.align, lineHeight: 1, padding: 2, width: field.width, height: field.height, wrap: "none", verticalAlign: "middle" });
    ctx.restore();
  }
}

/**
 * Paints the whole poster. `scale` maps poster pixels to canvas pixels
 * (1 for the download, smaller for the easel texture).
 */
export function renderCosplan(ctx: CanvasRenderingContext2D, composition: CosplanComposition, images: CosplanImages, scale = 1) {
  const { width, height } = composition;
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.closePath();
  ctx.fill();
  if (images.background) ctx.drawImage(images.background, 0, 0, width, height);
  for (const layer of composition.layers) paintLayer(ctx, composition, images, layer.id, true);
  paintNames(ctx, composition);
  ctx.restore();
}

/** One piece of the poster alone, over transparency (the background over white). */
export function renderCosplanPart(ctx: CanvasRenderingContext2D, composition: CosplanComposition, images: CosplanImages, part: CosplanPart, scale = 1) {
  const { width, height } = composition;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = true;
  if (part.kind === "background") {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    if (images.background) ctx.drawImage(images.background, 0, 0, width, height);
  } else if (part.kind === "foreground") {
    if (images.foreground) ctx.drawImage(images.foreground, 0, 0, width, height);
  } else if (part.kind === "names") paintNames(ctx, composition);
  else paintLayer(ctx, composition, images, part.id, false);
  ctx.restore();
}

/** Every image a poster needs, loaded; images that fail are left out. */
export async function loadCosplanImages(composition: CosplanComposition): Promise<CosplanImages> {
  const load = (src: string | null | undefined) =>
    src
      ? new Promise<HTMLImageElement | null>((resolve) => {
          const image = new Image();
          image.decoding = "async";
          image.onload = () => resolve(image);
          image.onerror = () => resolve(null);
          image.src = src;
        })
      : Promise.resolve(null);
  const characters = composition.layers.filter((layer): layer is CosplanImageLayer => layer.type === "image");
  const [background, foreground, ...loaded] = await Promise.all([load(composition.backgroundUrl), load(composition.foregroundUrl), ...characters.map((layer) => load(layer.src))]);
  const layers = new Map<string, CosplanImage>();
  characters.forEach((layer, i) => {
    const image = loaded[i];
    if (image) layers.set(layer.id, image);
  });
  return { background, foreground, layers };
}

/** The finished poster as a PNG at the background's own size. */
export async function exportCosplanPng(composition: CosplanComposition, images: CosplanImages): Promise<Blob> {
  await document.fonts.ready;
  const canvas = document.createElement("canvas");
  canvas.width = composition.width;
  canvas.height = composition.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("exportFailed");
  renderCosplan(ctx, composition, images);
  try {
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("exportFailed"))), "image/png"));
  } finally {
    canvas.width = canvas.height = 1;
  }
}
