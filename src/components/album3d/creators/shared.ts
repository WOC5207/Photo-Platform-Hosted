import type { PosterStage } from "../poster";

/** Pieces shared by the 3D site's Cosplan and Sharepost screens. */

/** An empty poster on the easel: paper with a dashed frame and a label. */
export function paintBlankPoster(canvas: HTMLCanvasElement, label: string) {
  const c = canvas.getContext("2d");
  if (!c) return;
  const { width: w, height: h } = canvas;
  const unit = Math.min(w, h) / 100;
  c.fillStyle = "#f4f0ea";
  c.fillRect(0, 0, w, h);
  c.strokeStyle = "rgba(28,26,22,0.28)";
  c.lineWidth = unit * 0.5;
  c.setLineDash([unit * 2.4, unit * 1.6]);
  c.strokeRect(unit * 7, unit * 7, w - unit * 14, h - unit * 14);
  c.setLineDash([]);
  c.fillStyle = "rgba(28,26,22,0.5)";
  c.font = `600 ${Math.round(unit * 4.2)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(label.toUpperCase(), w / 2, h / 2);
}

/** Hands a finished file to the browser's downloads. */
export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/**
 * Renders the download while the poster slides into the print slot, and
 * waits for both (the slide at most a few seconds, in case frames stop).
 */
export async function printPoster(scene: PosterStage | null, render: () => Promise<Blob>): Promise<Blob> {
  scene?.setPrinting(true);
  try {
    const slid = scene ? Promise.race([scene.whenPrinted(), new Promise<void>((resolve) => window.setTimeout(resolve, 4000))]) : Promise.resolve();
    const [blob] = await Promise.all([render(), slid]);
    return blob;
  } finally {
    scene?.setPrinting(false);
  }
}

export function safeFilename(value: string, fallback: string): string {
  return value.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").slice(0, 80) || fallback;
}

/** Whether the device's share sheet can take this file (phones, mostly). */
export function canShareFile(file: File): boolean {
  if (typeof navigator === "undefined" || !navigator.share) return false;
  try {
    return !navigator.canShare || navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** Opens the share sheet; false when it failed for a reason other than the visitor closing it. */
export async function shareFile(file: File, title: string): Promise<boolean> {
  try {
    await navigator.share({ files: [file], title });
    return true;
  } catch (error) {
    return (error as DOMException).name === "AbortError";
  }
}
