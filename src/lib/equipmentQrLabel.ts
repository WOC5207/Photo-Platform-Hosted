import type { EquipmentQrLabelLayout, EquipmentQrLogoPlacement } from "@/lib/equipmentQrSheet";

/**
 * Drawing, printing and downloading equipment QR labels in the browser. The
 * classic label tool and the 3D Dashboard's label sheet both export through
 * here, so a label prints at the same size and with the same layout from
 * either site.
 */

export type EquipmentQrLabelItem = {
  id: string;
  name: string;
  category: string;
  qrToken: string;
};

export type LabelRotation = 0 | 90 | 180 | 270;

/** Everything about one label's artwork except the item it is for. */
export interface LabelArtwork {
  widthMm: number;
  heightMm: number;
  layout: EquipmentQrLabelLayout;
  includeName: boolean;
  includeUid: boolean;
  /** The site logo, or "" to leave it off. */
  logoUrl: string;
  logoPlacement: EquipmentQrLogoPlacement;
  /** A background for this session only (an object URL), or "". */
  backgroundUrl: string;
  backgroundOpacity: number;
  rotation: LabelRotation;
}

const PX_PER_MM = 300 / 25.4;
export const CENTER_LOGO_BACKING_MM = 1.2;

export async function createQrDataUrl(value: string, width: number): Promise<string> {
  const { default: QRCode } = await import("qrcode");
  return QRCode.toDataURL(value, {
    errorCorrectionLevel: "H",
    margin: 1,
    width,
    color: { dark: "#111111", light: "#ffffff" }
  });
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image could not be loaded"));
    image.src = src;
  });
}

function fittedText(context: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (context.measureText(text).width <= maxWidth) return text;
  let value = text;
  while (value.length > 1 && context.measureText(`${value}…`).width > maxWidth) {
    value = value.slice(0, -1);
  }
  return `${value}…`;
}

export function equipmentUid(item: { qrToken: string }): string {
  return item.qrToken.slice(0, 8).toUpperCase();
}

/** Where a label's QR code sends the person who scans it. */
export function labelScanUrl(locale: string, qrToken: string): string {
  return new URL(`/${locale}/equipment/${encodeURIComponent(qrToken)}`, window.location.origin).toString();
}

/** The output size after rotation: quarter turns swap width and height. */
export function outputSize(art: Pick<LabelArtwork, "widthMm" | "heightMm" | "rotation">): { widthMm: number; heightMm: number } {
  const swap = art.rotation === 90 || art.rotation === 270;
  return swap ? { widthMm: art.heightMm, heightMm: art.widthMm } : { widthMm: art.widthMm, heightMm: art.heightMm };
}

async function renderLabelCanvas({
  item,
  scanUrl,
  widthMm,
  heightMm,
  layout,
  includeName,
  includeUid,
  logo,
  logoPlacement,
  background,
  backgroundOpacity
}: {
  item: EquipmentQrLabelItem;
  scanUrl: string;
  widthMm: number;
  heightMm: number;
  layout: EquipmentQrLabelLayout;
  includeName: boolean;
  includeUid: boolean;
  logo: HTMLImageElement | null;
  logoPlacement: EquipmentQrLogoPlacement;
  background: HTMLImageElement | null;
  backgroundOpacity: number;
}): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(widthMm * PX_PER_MM);
  canvas.height = Math.round(heightMm * PX_PER_MM);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  if (background) {
    const scale = Math.max(canvas.width / background.naturalWidth, canvas.height / background.naturalHeight);
    const backgroundWidth = background.naturalWidth * scale;
    const backgroundHeight = background.naturalHeight * scale;
    context.save();
    context.globalAlpha = Math.min(1, Math.max(0, backgroundOpacity / 100));
    context.drawImage(
      background,
      (canvas.width - backgroundWidth) / 2,
      (canvas.height - backgroundHeight) / 2,
      backgroundWidth,
      backgroundHeight
    );
    context.restore();
  }
  let cursorY = layout.paddingMm * PX_PER_MM;

  if (logo && logoPlacement === "ABOVE") {
    const maxLogoWidth = canvas.width - 16 * PX_PER_MM;
    const maxLogoHeight = layout.logoHeightMm * PX_PER_MM;
    const scale = Math.min(maxLogoWidth / logo.naturalWidth, maxLogoHeight / logo.naturalHeight);
    const logoWidth = logo.naturalWidth * scale;
    const logoHeight = logo.naturalHeight * scale;
    context.drawImage(logo, (canvas.width - logoWidth) / 2, cursorY, logoWidth, logoHeight);
    cursorY += layout.logoSlotMm * PX_PER_MM;
  }

  const qrDataUrl = await createQrDataUrl(scanUrl, Math.max(600, Math.round(layout.qrSizeMm * PX_PER_MM)));
  const qrImage = await loadImage(qrDataUrl);
  const qrSize = layout.qrSizeMm * PX_PER_MM;
  context.imageSmoothingEnabled = false;
  const qrX = (canvas.width - qrSize) / 2;
  const qrY = cursorY;
  context.drawImage(qrImage, qrX, qrY, qrSize, qrSize);

  if (logo && logoPlacement === "CENTER") {
    const maxLogoSize = layout.logoHeightMm * PX_PER_MM;
    const scale = Math.min(maxLogoSize / logo.naturalWidth, maxLogoSize / logo.naturalHeight);
    const logoWidth = logo.naturalWidth * scale;
    const logoHeight = logo.naturalHeight * scale;
    const logoX = qrX + (qrSize - logoWidth) / 2;
    const logoY = qrY + (qrSize - logoHeight) / 2;
    const backing = (CENTER_LOGO_BACKING_MM * PX_PER_MM) / 2;
    context.imageSmoothingEnabled = true;
    context.fillStyle = "#ffffff";
    context.fillRect(logoX - backing, logoY - backing, logoWidth + backing * 2, logoHeight + backing * 2);
    context.drawImage(logo, logoX, logoY, logoWidth, logoHeight);
  }
  cursorY += qrSize;
  cursorY += layout.textBlockGapMm * PX_PER_MM;

  if (includeName) {
    const fontSize = layout.nameTextSizePt * (300 / 72);
    context.imageSmoothingEnabled = true;
    context.fillStyle = "#211d18";
    context.font = `600 ${fontSize}px "Avenir Next", "Segoe UI", "Microsoft YaHei", sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(
      fittedText(context, item.name, canvas.width - 8 * PX_PER_MM),
      canvas.width / 2,
      cursorY + (layout.nameSlotMm * PX_PER_MM) / 2
    );
    cursorY += layout.nameSlotMm * PX_PER_MM;
  }

  if (includeUid) {
    cursorY += layout.nameUidGapMm * PX_PER_MM;
    const fontSize = layout.uidTextSizePt * (300 / 72);
    context.imageSmoothingEnabled = true;
    context.fillStyle = "#514a41";
    context.font = `500 ${fontSize}px "SFMono-Regular", Consolas, "Liberation Mono", monospace`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(equipmentUid(item), canvas.width / 2, cursorY + (layout.uidSlotMm * PX_PER_MM) / 2);
  }
  return canvas;
}

function rotateLabelCanvas(source: HTMLCanvasElement, rotation: LabelRotation): HTMLCanvasElement {
  if (rotation === 0) return source;

  const rotated = document.createElement("canvas");
  const swapsDimensions = rotation === 90 || rotation === 270;
  rotated.width = swapsDimensions ? source.height : source.width;
  rotated.height = swapsDimensions ? source.width : source.height;
  const context = rotated.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");

  if (rotation === 90) {
    context.translate(rotated.width, 0);
    context.rotate(Math.PI / 2);
  } else if (rotation === 180) {
    context.translate(rotated.width, rotated.height);
    context.rotate(Math.PI);
  } else {
    context.translate(0, rotated.height);
    context.rotate(-Math.PI / 2);
  }
  context.drawImage(source, 0, 0);
  return rotated;
}

/** The logo and background, loaded once for a batch of labels. */
export async function loadArtwork(art: LabelArtwork): Promise<{ logo: HTMLImageElement | null; background: HTMLImageElement | null }> {
  const [logo, background] = await Promise.all([
    art.logoUrl ? loadImage(art.logoUrl) : Promise.resolve(null),
    art.backgroundUrl ? loadImage(art.backgroundUrl) : Promise.resolve(null)
  ]);
  return { logo, background };
}

/** One finished label at 300 DPI, rotated for output. */
export async function renderLabel(
  item: EquipmentQrLabelItem,
  art: LabelArtwork,
  locale: string,
  images: { logo: HTMLImageElement | null; background: HTMLImageElement | null }
): Promise<HTMLCanvasElement> {
  const label = await renderLabelCanvas({
    item,
    scanUrl: labelScanUrl(locale, item.qrToken),
    widthMm: art.widthMm,
    heightMm: art.heightMm,
    layout: art.layout,
    includeName: art.includeName,
    includeUid: art.includeUid,
    logo: images.logo,
    logoPlacement: art.logoPlacement,
    background: images.background,
    backgroundOpacity: art.backgroundOpacity
  });
  return rotateLabelCanvas(label, art.rotation);
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG could not be generated"))), "image/png");
  });
}

function safeFileName(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9一-鿿]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
  return normalized || "equipment";
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function waitForImages(images: HTMLImageElement[]): Promise<void> {
  return Promise.all(
    images.map((image) =>
      image.complete && image.naturalWidth > 0
        ? Promise.resolve()
        : new Promise<void>((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = () => reject(new Error("Label image could not be loaded"));
          })
    )
  ).then(() => undefined);
}

async function printLabelImages(blobs: Blob[], widthMm: number, heightMm: number): Promise<void> {
  const urls = blobs.map((blob) => URL.createObjectURL(blob));
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);
  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    frame.remove();
    urls.forEach((url) => URL.revokeObjectURL(url));
  };

  try {
    const frameWindow = frame.contentWindow;
    const frameDocument = frame.contentDocument;
    if (!frameWindow || !frameDocument) throw new Error("Print frame is unavailable");
    frameDocument.open();
    frameDocument.write(`<!doctype html><html><head><title>QR labels</title><style>
@page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; }
img { display: block; width: ${widthMm}mm; height: ${heightMm}mm; break-after: page; page-break-after: always; }
img:last-child { break-after: auto; page-break-after: auto; }
</style></head><body></body></html>`);
    frameDocument.close();
    const images = urls.map((url) => {
      const image = frameDocument.createElement("img");
      image.alt = "";
      image.src = url;
      frameDocument.body.appendChild(image);
      return image;
    });
    await waitForImages(images);
    frameWindow.addEventListener("afterprint", () => window.setTimeout(cleanup, 0), { once: true });
    // Some browsers return from print() before the dialog closes and never
    // fire afterprint; keep the frame alive long enough for the dialog.
    window.setTimeout(cleanup, 10 * 60 * 1000);
    frameWindow.focus();
    frameWindow.print();
  } catch (error) {
    cleanup();
    throw error;
  }
}

/** One PDF page per label, at the rotated output size. */
export async function downloadLabelPdf(items: EquipmentQrLabelItem[], art: LabelArtwork, locale: string): Promise<void> {
  const [{ jsPDF }, images] = await Promise.all([import("jspdf"), loadArtwork(art)]);
  const out = outputSize(art);
  const orientation = out.widthMm > out.heightMm ? "landscape" : "portrait";
  const document = new jsPDF({ unit: "mm", format: [out.widthMm, out.heightMm], orientation, compress: true });
  for (let index = 0; index < items.length; index += 1) {
    if (index > 0) document.addPage([out.widthMm, out.heightMm], orientation);
    const label = await renderLabel(items[index], art, locale, images);
    document.addImage(label.toDataURL("image/png"), "PNG", 0, 0, out.widthMm, out.heightMm, undefined, "FAST");
  }
  document.save(`equipment-qr-labels-${new Date().toISOString().slice(0, 10)}.pdf`);
}

/** One 300 DPI PNG per label. */
export async function downloadLabelPngs(items: EquipmentQrLabelItem[], art: LabelArtwork, locale: string): Promise<void> {
  const images = await loadArtwork(art);
  for (const item of items) {
    const label = await renderLabel(item, art, locale, images);
    triggerDownload(await canvasBlob(label), `${safeFileName(item.name)}-qr-label.png`);
  }
}

/** The browser's print dialog, one label per page at its exact size. */
export async function printLabels(items: EquipmentQrLabelItem[], art: LabelArtwork, locale: string): Promise<void> {
  const images = await loadArtwork(art);
  const blobs: Blob[] = [];
  for (const item of items) blobs.push(await canvasBlob(await renderLabel(item, art, locale, images)));
  const out = outputSize(art);
  await printLabelImages(blobs, out.widthMm, out.heightMm);
}
