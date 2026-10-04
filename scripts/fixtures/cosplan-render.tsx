import React from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import CosplanEditor from "../../src/components/cosplan/CosplanEditor";
import { readDraft, restoreDraft, writeDraft } from "../../src/lib/cosplanDraft";
import { exportCosplanPng, loadCosplanImages } from "../../src/lib/cosplanCanvas";
import { normalizeCosplanLayerOrder, type CosplanComposition, type CosplanSlot, type CosplanTemplateSummary } from "../../src/lib/cosplanTypes";
import en from "../../messages/en.json";

/**
 * The same Cosplan draft, downloaded from the classic Konva editor and
 * painted by lib/cosplanCanvas, for scripts/test-cosplan-render.ts.
 */

const slots: CosplanSlot[] = [
  { id: "left", nameEn: "Left", nameZh: "左", x: 40, y: 160, width: 340, height: 620, nameText: { x: 40, y: 790, width: 340, height: 56, fontSize: 30, fill: "#ffffff", align: "center", bold: true } },
  {
    id: "right",
    nameEn: "Right",
    nameZh: "右",
    x: 420,
    y: 160,
    width: 340,
    height: 620,
    // An arched opening with a label cut out of it.
    shape: {
      type: "polygon",
      contours: [
        [{ x: 0, y: 0.18 }, { x: 0.25, y: 0.02 }, { x: 0.5, y: 0 }, { x: 0.75, y: 0.02 }, { x: 1, y: 0.18 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
        [{ x: 0.1, y: 0.85 }, { x: 0.1, y: 0.95 }, { x: 0.6, y: 0.95 }, { x: 0.6, y: 0.85 }]
      ]
    },
    nameText: { x: 420, y: 790, width: 340, height: 56, fontSize: 40, fill: "#ffe08a", align: "left", bold: false }
  }
];

const template: CosplanTemplateSummary = {
  id: "render",
  title: "Render poster",
  titleEn: "Render poster",
  titleZh: "渲染海报",
  assetToken: "render",
  imageUrl: "/background.svg",
  foregroundToken: "render-fg",
  foregroundUrl: "/foreground.png",
  layoutVersion: 1,
  slots,
  width: 800,
  height: 1000
};

/** A character stand-in with stripes and a ring, so a shift or bad crop shows. */
function character(width: number, height: number, hue: number): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const c = canvas.getContext("2d")!;
  c.fillStyle = `hsl(${hue} 70% 45%)`;
  c.fillRect(0, 0, width, height);
  c.fillStyle = `hsl(${hue + 40} 80% 70%)`;
  for (let x = 0; x < width; x += 24) c.fillRect(x, 0, 9, height);
  c.strokeStyle = "#111";
  c.lineWidth = 14;
  c.beginPath();
  c.arc(width / 2, height / 3, Math.min(width, height) / 4, 0, Math.PI * 2);
  c.stroke();
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob!), "image/png"));
}

async function seed() {
  const [a, b, c] = await Promise.all([character(300, 560, 10), character(420, 520, 200), character(260, 260, 120)]);
  const draft: CosplanComposition = {
    version: 2,
    templateId: template.id,
    templateTitle: template.title,
    assetToken: template.assetToken,
    backgroundUrl: template.imageUrl,
    foregroundToken: template.foregroundToken,
    foregroundUrl: template.foregroundUrl,
    layoutVersion: 1,
    slots,
    width: 800,
    height: 1000,
    updatedAt: Date.now(),
    layers: normalizeCosplanLayerOrder([
      { id: "a", type: "image", name: "Hatsune  Miku", showName: true, src: "", blob: a, slotId: "left", slot: slots[0], x: 60, y: 190, width: 300, height: 560, rotation: 0, cropX: 0, cropY: 0, cropWidth: 1, cropHeight: 1 },
      { id: "b", type: "image", name: "初音未来 with a name far too long for its box", showName: true, src: "", blob: b, slotId: "right", slot: slots[1], x: 380, y: 140, width: 460, height: 640, rotation: 7.5, cropX: 0.1, cropY: 0.05, cropWidth: 0.8, cropHeight: 0.9 },
      { id: "c", type: "image", name: "Free", showName: true, src: "", blob: c, x: 300, y: 820, width: 150, height: 150, rotation: -20, cropX: 0, cropY: 0, cropWidth: 1, cropHeight: 1 },
      { id: "t1", type: "text", name: "Title", text: "Cosplay lineup for the autumn photo walk", x: 60, y: 30, width: 680, rotation: 0, fontSize: 46, fill: "#ffffff", align: "center", bold: true, fontFamily: "Arial" },
      { id: "t2", type: "text", name: "Date", text: "Saturday\n10:00 – 16:00", x: 520, y: 860, width: 240, rotation: -4, fontSize: 28, fill: "#ffe08a", align: "right", bold: false, fontFamily: "Georgia" },
      { id: "t3", type: "text", name: "Mixed", text: "中文和 English mixed-wrapping-without-spaces-at-all here", x: 40, y: 880, width: 230, rotation: 0, fontSize: 22, fill: "#e8f0ff", align: "left", bold: false, fontFamily: "Trebuchet MS" }
    ])
  };
  await writeDraft(draft);
}

async function paint(): Promise<string> {
  const stored = await readDraft();
  if (!stored) throw new Error("no draft");
  const draft = restoreDraft(stored);
  const blob = await exportCosplanPng(draft, await loadCosplanImages(draft));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

Object.assign(window, { fixture: { seed, paint } });

createRoot(document.getElementById("root")!).render(
  <NextIntlClientProvider locale="en" messages={en}>
    <CosplanEditor templates={[template]} />
  </NextIntlClientProvider>
);
