"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createQrDataUrl, equipmentUid, labelScanUrl } from "@/lib/equipmentQrLabel";
import type { StudioGear, StudioGearStatus } from "./types";

/** Pieces shared by the 3D Dashboard's equipment screens. */

/** The classic inventory's names for each status, in the "equipment" messages. */
export const STATUS_KEY = {
  IN_INVENTORY: "statusInInventory",
  SIGNED_OUT: "statusSignedOut",
  MAINTENANCE: "statusMaintenance",
  BROKEN: "statusBroken",
  OTHER: "statusOther"
} as const satisfies Record<StudioGearStatus, string>;

/** Status colours on the ID cards: in hand, out, needs attention, anything else. */
const STATUS_INK: Record<StudioGearStatus, string> = {
  IN_INVENTORY: "#2f7d4f",
  SIGNED_OUT: "#c0612b",
  MAINTENANCE: "#b23a2e",
  BROKEN: "#b23a2e",
  OTHER: "#6e665b"
};

/**
 * Images by URL, loaded once each. The returned function changes when one
 * arrives, so effects that paint with it run again.
 */
export function useImages(): (src: string) => HTMLImageElement | null {
  const cache = useRef(new Map<string, HTMLImageElement>());
  const [version, setVersion] = useState(0);
  return useCallback(
    (src: string) => {
      if (!src) return null;
      const hit = cache.current.get(src);
      if (hit) return hit.complete && hit.naturalWidth > 0 ? hit : null;
      const image = new Image();
      image.decoding = "async";
      image.onload = () => setVersion((v) => v + 1);
      image.src = src;
      cache.current.set(src, image);
      return null;
    },
    // version: images that finished loading since the last render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version]
  );
}

/**
 * The QR code an item's label carries, as an image, once it has been drawn.
 * The scan link needs the page's origin, so it is made after mounting.
 */
export function useQrImage(locale: string, qrToken: string): HTMLImageElement | null {
  const [image, setImage] = useState<{ token: string; image: HTMLImageElement } | null>(null);
  useEffect(() => {
    if (!qrToken) return;
    let live = true;
    createQrDataUrl(labelScanUrl(locale, qrToken), 360)
      .then(
        (data) =>
          new Promise<HTMLImageElement>((resolve, reject) => {
            const qr = new Image();
            qr.onload = () => resolve(qr);
            qr.onerror = reject;
            qr.src = data;
          })
      )
      .then((qr) => live && setImage({ token: `${locale}:${qrToken}`, image: qr }))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [locale, qrToken]);
  return image?.token === `${locale}:${qrToken}` ? image.image : null;
}

/** An ID card stands 5:7, like the photographer cards. */
export const GEAR_CARD_ASPECT = 5 / 7;

function fit(c: CanvasRenderingContext2D, text: string, width: number): string {
  if (c.measureText(text).width <= width) return text;
  let value = text;
  while (value.length > 1 && c.measureText(`${value}…`).width > width) value = value.slice(0, -1);
  return `${value}…`;
}

/**
 * Paint a piece of equipment's ID card: its photo in the window, name and
 * category, a status bar in the status's colour, the serial number, and the
 * QR code its label prints, with the short UID under it.
 */
export function paintGearCard(
  canvas: HTMLCanvasElement,
  gear: Pick<StudioGear, "name" | "brand" | "model" | "category" | "status" | "statusNote" | "serialNumber" | "qrToken">,
  art: { photo: HTMLImageElement | null; qr: HTMLImageElement | null; accent: string; status: string; serial: string; noPhoto: string }
) {
  const c = canvas.getContext("2d");
  if (!c) return;
  const w = canvas.width;
  const h = canvas.height;
  const u = w / 100;
  const ink = "#1c1a16";
  const muted = "rgba(28,26,22,0.55)";
  const sans = '"Avenir Next", "Segoe UI", "Microsoft YaHei", system-ui, sans-serif';
  const mono = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  c.fillStyle = "#f7f4ef";
  c.fillRect(0, 0, w, h);

  // Corner fasteners, as on the photographer cards.
  c.fillStyle = "#6e665b";
  for (const [x, y] of [
    [3, 3],
    [97, 3],
    [3, 97],
    [97, 97]
  ]) {
    c.beginPath();
    c.arc(x * u, (y / 100) * h, u * 1.1, 0, Math.PI * 2);
    c.fill();
  }

  const pad = 7 * u;
  c.textBaseline = "alphabetic";
  c.fillStyle = muted;
  c.font = `500 ${3.4 * u}px ${mono}`;
  const category = gear.category.toUpperCase();
  c.fillText(fit(c, category, w * 0.6), pad, pad + 2 * u);
  const uid = equipmentUid(gear);
  c.fillText(uid, w - pad - c.measureText(uid).width, pad + 2 * u);

  // Photo window.
  const photoTop = pad + 6 * u;
  const photoH = h * 0.4;
  c.fillStyle = "#e4dfd5";
  c.fillRect(pad, photoTop, w - pad * 2, photoH);
  if (art.photo) {
    const { naturalWidth: iw, naturalHeight: ih } = art.photo;
    const box = (w - pad * 2) / photoH;
    const sw = iw / ih > box ? ih * box : iw;
    const sh = iw / ih > box ? ih : iw / box;
    c.drawImage(art.photo, (iw - sw) / 2, (ih - sh) / 2, sw, sh, pad, photoTop, w - pad * 2, photoH);
  } else {
    c.fillStyle = muted;
    c.font = `600 ${3.4 * u}px ${mono}`;
    c.textAlign = "center";
    c.fillText(art.noPhoto.toUpperCase(), w / 2, photoTop + photoH / 2);
    c.textAlign = "left";
  }

  let y = photoTop + photoH + 5 * u;
  c.fillStyle = art.accent;
  c.fillRect(pad, y, 12 * u, 1.1 * u);
  y += 10 * u;
  c.fillStyle = ink;
  c.font = `800 ${8 * u}px ${sans}`;
  c.fillText(fit(c, gear.name.toUpperCase(), w - pad * 2), pad, y);
  const make = [gear.brand, gear.model].filter(Boolean).join(" · ");
  if (make && make !== gear.name) {
    y += 5.6 * u;
    c.fillStyle = muted;
    c.font = `400 ${3.6 * u}px ${mono}`;
    c.fillText(fit(c, make, w - pad * 2), pad, y);
  }

  // Status bar.
  y += 5 * u;
  c.fillStyle = STATUS_INK[gear.status];
  c.fillRect(pad, y, w - pad * 2, 7 * u);
  c.fillStyle = "#ffffff";
  c.font = `700 ${3.6 * u}px ${mono}`;
  c.textBaseline = "middle";
  c.fillText(fit(c, art.status.toUpperCase(), w - pad * 2 - 4 * u), pad + 2 * u, y + 3.6 * u);
  c.textBaseline = "alphabetic";
  y += 7 * u;
  if (gear.statusNote) {
    y += 5 * u;
    c.fillStyle = muted;
    c.font = `400 ${3.4 * u}px ${sans}`;
    c.fillText(fit(c, gear.statusNote, w - pad * 2), pad, y);
  }

  // Serial on the left, the label's QR code on the right, along the bottom.
  const qrSize = 22 * u;
  const qrX = w - pad - qrSize;
  const qrY = h - pad - qrSize;
  c.fillStyle = "#ffffff";
  c.fillRect(qrX, qrY, qrSize, qrSize);
  if (art.qr) {
    c.imageSmoothingEnabled = false;
    c.drawImage(art.qr, qrX, qrY, qrSize, qrSize);
    c.imageSmoothingEnabled = true;
  }
  c.fillStyle = muted;
  c.font = `500 ${3 * u}px ${mono}`;
  c.fillText(art.serial.toUpperCase(), pad, h - pad - 9 * u);
  c.fillStyle = ink;
  c.font = `600 ${4 * u}px ${mono}`;
  c.fillText(fit(c, gear.serialNumber || "—", qrX - pad - 3 * u), pad, h - pad - 3 * u);
}
