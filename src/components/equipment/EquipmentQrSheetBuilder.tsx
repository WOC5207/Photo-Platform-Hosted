"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import QRCode from "qrcode";
import Button, { buttonClasses } from "@/components/ui/Button";
import { controlClasses, Field, Input } from "@/components/ui/Field";
import { Link } from "@/i18n/navigation";
import {
  calculateEquipmentQrLabelLayout,
  QR_LABEL_MAX_LOGO_HEIGHT_MM,
  QR_LABEL_MAX_SIZE_MM,
  QR_LABEL_MAX_TEXT_SIZE_PT,
  QR_LABEL_MIN_LOGO_HEIGHT_MM,
  QR_LABEL_MIN_SIZE_MM,
  QR_LABEL_MIN_TEXT_SIZE_PT,
  type EquipmentQrLabelLayout,
  type EquipmentQrLogoPlacement
} from "@/lib/equipmentQrSheet";

export type EquipmentQrLabelItem = {
  id: string;
  name: string;
  category: string;
  qrToken: string;
};

type SavedSize = { widthMm: number; heightMm: number };

const STORAGE_KEY = "photo-platform:equipment-qr-label-size:v2";
const DEFAULT_SIZE: SavedSize = { widthMm: 50, heightMm: 70 };
const DEFAULT_TEXT_SIZE_PT = 10;
const DEFAULT_LOGO_HEIGHT_MM = 7;
const CENTER_LOGO_BACKING_MM = 1.2;
const PX_PER_MM = 300 / 25.4;
const DEFAULT_BACKGROUND_OPACITY = 30;
const MAX_BACKGROUND_BYTES = 12 * 1024 * 1024;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image could not be loaded"));
    image.src = src;
  });
}

function fittedText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  if (context.measureText(text).width <= maxWidth) return text;
  let value = text;
  while (value.length > 1 && context.measureText(`${value}…`).width > maxWidth) {
    value = value.slice(0, -1);
  }
  return `${value}…`;
}

function equipmentUid(item: EquipmentQrLabelItem): string {
  return item.qrToken.slice(0, 8).toUpperCase();
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
    const scale = Math.max(
      canvas.width / background.naturalWidth,
      canvas.height / background.naturalHeight
    );
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
    const scale = Math.min(
      maxLogoWidth / logo.naturalWidth,
      maxLogoHeight / logo.naturalHeight
    );
    const logoWidth = logo.naturalWidth * scale;
    const logoHeight = logo.naturalHeight * scale;
    context.drawImage(
      logo,
      (canvas.width - logoWidth) / 2,
      cursorY,
      logoWidth,
      logoHeight
    );
    cursorY += layout.logoSlotMm * PX_PER_MM;
  }

  const qrDataUrl = await QRCode.toDataURL(scanUrl, {
    errorCorrectionLevel: "H",
    margin: 1,
    width: Math.max(600, Math.round(layout.qrSizeMm * PX_PER_MM)),
    color: { dark: "#111111", light: "#ffffff" }
  });
  const qrImage = await loadImage(qrDataUrl);
  const qrSize = layout.qrSizeMm * PX_PER_MM;
  context.imageSmoothingEnabled = false;
  const qrX = (canvas.width - qrSize) / 2;
  const qrY = cursorY;
  context.drawImage(qrImage, qrX, qrY, qrSize, qrSize);

  if (logo && logoPlacement === "CENTER") {
    const maxLogoSize = layout.logoHeightMm * PX_PER_MM;
    const scale = Math.min(
      maxLogoSize / logo.naturalWidth,
      maxLogoSize / logo.naturalHeight
    );
    const logoWidth = logo.naturalWidth * scale;
    const logoHeight = logo.naturalHeight * scale;
    const logoX = qrX + (qrSize - logoWidth) / 2;
    const logoY = qrY + (qrSize - logoHeight) / 2;
    const backing = (CENTER_LOGO_BACKING_MM * PX_PER_MM) / 2;
    context.imageSmoothingEnabled = true;
    context.fillStyle = "#ffffff";
    context.fillRect(
      logoX - backing,
      logoY - backing,
      logoWidth + backing * 2,
      logoHeight + backing * 2
    );
    context.drawImage(logo, logoX, logoY, logoWidth, logoHeight);
  }
  cursorY += qrSize;

  if (includeName) {
    const fontSize = layout.textSizePt * (300 / 72);
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
    const fontSize = layout.uidTextSizePt * (300 / 72);
    context.imageSmoothingEnabled = true;
    context.fillStyle = "#514a41";
    context.font = `500 ${fontSize}px "SFMono-Regular", Consolas, "Liberation Mono", monospace`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(
      equipmentUid(item),
      canvas.width / 2,
      cursorY + (layout.uidSlotMm * PX_PER_MM) / 2
    );
  }
  return canvas;
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("PNG could not be generated"))),
      "image/png"
    );
  });
}

function safeFileName(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9\u4e00-\u9fff]+/g, "-")
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

function isSavedSize(value: unknown): value is SavedSize {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SavedSize>;
  return typeof candidate.widthMm === "number" && typeof candidate.heightMm === "number";
}

export default function EquipmentQrSheetBuilder({
  equipment,
  categories,
  locale,
  logoUrl
}: {
  equipment: EquipmentQrLabelItem[];
  categories: string[];
  locale: string;
  logoUrl: string;
}) {
  const t = useTranslations("equipmentQrPrint");
  const [includeName, setIncludeName] = useState(true);
  const [includeUid, setIncludeUid] = useState(false);
  const [includeLogo, setIncludeLogo] = useState(Boolean(logoUrl));
  const [logoPlacement, setLogoPlacement] = useState<EquipmentQrLogoPlacement>("ABOVE");
  const [textSizeInput, setTextSizeInput] = useState(String(DEFAULT_TEXT_SIZE_PT));
  const [logoHeightInput, setLogoHeightInput] = useState(String(DEFAULT_LOGO_HEIGHT_MM));
  const [backgroundUrl, setBackgroundUrl] = useState("");
  const [backgroundName, setBackgroundName] = useState("");
  const [backgroundOpacityInput, setBackgroundOpacityInput] = useState(String(DEFAULT_BACKGROUND_OPACITY));
  const [widthInput, setWidthInput] = useState(String(DEFAULT_SIZE.widthMm));
  const [heightInput, setHeightInput] = useState(String(DEFAULT_SIZE.heightMm));
  const [savedSize, setSavedSize] = useState(DEFAULT_SIZE);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("ALL");
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewQrs, setPreviewQrs] = useState<Record<string, string>>({});
  const [mobilePreviewExpanded, setMobilePreviewExpanded] = useState(true);
  const [exporting, setExporting] = useState<"pdf" | "png" | null>(null);
  const [sizeNotice, setSizeNotice] = useState("");
  const [message, setMessage] = useState<
    { kind: "success" | "error"; text: string } | null
  >(null);
  const backgroundObjectUrl = useRef("");

  useEffect(
    () => () => {
      if (backgroundObjectUrl.current) URL.revokeObjectURL(backgroundObjectUrl.current);
    },
    []
  );

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
      if (
        isSavedSize(stored) &&
        calculateEquipmentQrLabelLayout({
          labelWidthMm: stored.widthMm,
          labelHeightMm: stored.heightMm,
          includeName: true,
          includeUid: false,
          includeLogo: Boolean(logoUrl),
          logoPlacement: "ABOVE",
          textSizePt: DEFAULT_TEXT_SIZE_PT,
          logoHeightMm: DEFAULT_LOGO_HEIGHT_MM
        })
      ) {
        setWidthInput(String(stored.widthMm));
        setHeightInput(String(stored.heightMm));
        setSavedSize(stored);
      }
    } catch {
      // Invalid local preferences fall back to 50 × 70 mm.
    }
  }, [logoUrl]);

  const labelWidthMm = Number(widthInput);
  const labelHeightMm = Number(heightInput);
  const textSizePt = Number(textSizeInput);
  const logoHeightMm = Number(logoHeightInput);
  const backgroundOpacity = Number(backgroundOpacityInput);
  const selectedEquipment = useMemo(
    () => equipment.filter((item) => selectedIds.has(item.id)),
    [equipment, selectedIds]
  );
  const filteredEquipment = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase(locale);
    return equipment.filter((item) => {
      if (category !== "ALL" && item.category !== category) return false;
      return (
        !normalizedQuery ||
        item.name.toLocaleLowerCase(locale).includes(normalizedQuery) ||
        item.category.toLocaleLowerCase(locale).includes(normalizedQuery)
      );
    });
  }, [category, equipment, locale, query]);
  const layout = useMemo(
    () =>
      calculateEquipmentQrLabelLayout({
        labelWidthMm,
        labelHeightMm,
        includeName,
        includeUid,
        includeLogo: includeLogo && Boolean(logoUrl),
        logoPlacement,
        textSizePt,
        logoHeightMm
      }),
    [includeLogo, includeName, includeUid, labelHeightMm, labelWidthMm, logoHeightMm, logoPlacement, logoUrl, textSizePt]
  );
  const totalPreviews = Math.max(1, selectedEquipment.length);
  const safePreviewIndex = Math.min(previewIndex, totalPreviews - 1);
  const previewItem = selectedEquipment[safePreviewIndex];
  const sizeChanged =
    labelWidthMm !== savedSize.widthMm || labelHeightMm !== savedSize.heightMm;

  useEffect(() => {
    if (!previewItem) return;
    let active = true;
    const scanUrl = new URL(
      `/${locale}/equipment/${encodeURIComponent(previewItem.qrToken)}`,
      window.location.origin
    ).toString();
    QRCode.toDataURL(scanUrl, {
      errorCorrectionLevel: "H",
      margin: 1,
      width: 360,
      color: { dark: "#111111", light: "#ffffff" }
    })
      .then((dataUrl) => {
        if (active) setPreviewQrs((current) => ({ ...current, [previewItem.id]: dataUrl }));
      })
      .catch(() => {
        if (active) setMessage({ kind: "error", text: t("previewError") });
      });
    return () => {
      active = false;
    };
  }, [locale, previewItem, t]);

  useEffect(() => {
    if (previewIndex >= totalPreviews) setPreviewIndex(Math.max(0, totalPreviews - 1));
  }, [previewIndex, totalPreviews]);

  useEffect(() => {
    if (!includeLogo || logoPlacement !== "CENTER" || !layout) return;
    if (logoHeightMm <= layout.logoHeightLimitMm) return;
    setLogoHeightInput(String(Math.floor(layout.logoHeightLimitMm * 10) / 10));
  }, [includeLogo, layout, logoHeightMm, logoPlacement]);

  function updateSelection(ids: string[], selected: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      ids.forEach((id) => (selected ? next.add(id) : next.delete(id)));
      return next;
    });
    setMessage(null);
  }

  function saveSize() {
    if (!layout) {
      setSizeNotice("");
      setMessage({ kind: "error", text: t("labelInvalid") });
      return;
    }
    const next = { widthMm: labelWidthMm, heightMm: labelHeightMm };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSavedSize(next);
    setSizeNotice(t("sizeSaved"));
    setMessage(null);
  }

  async function chooseBackground(file: File | undefined) {
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > MAX_BACKGROUND_BYTES
    ) {
      setMessage({ kind: "error", text: t("backgroundUploadError") });
      return;
    }
    const nextUrl = URL.createObjectURL(file);
    try {
      await loadImage(nextUrl);
      if (backgroundObjectUrl.current) URL.revokeObjectURL(backgroundObjectUrl.current);
      backgroundObjectUrl.current = nextUrl;
      setBackgroundUrl(nextUrl);
      setBackgroundName(file.name);
      setMessage({ kind: "success", text: t("backgroundReady") });
    } catch {
      URL.revokeObjectURL(nextUrl);
      setMessage({ kind: "error", text: t("backgroundUploadError") });
    }
  }

  function removeBackground() {
    if (backgroundObjectUrl.current) URL.revokeObjectURL(backgroundObjectUrl.current);
    backgroundObjectUrl.current = "";
    setBackgroundUrl("");
    setBackgroundName("");
    setMessage(null);
  }

  async function downloadPdf() {
    if (!layout || selectedEquipment.length === 0) {
      setMessage({
        kind: "error",
        text: layout ? t("selectBeforeDownload") : t("labelInvalid")
      });
      return;
    }
    setExporting("pdf");
    setMessage(null);
    try {
      const [{ jsPDF }, logo, background] = await Promise.all([
        import("jspdf"),
        includeLogo && logoUrl ? loadImage(logoUrl) : Promise.resolve(null),
        backgroundUrl ? loadImage(backgroundUrl) : Promise.resolve(null)
      ]);
      const orientation = labelWidthMm > labelHeightMm ? "landscape" : "portrait";
      const document = new jsPDF({
        unit: "mm",
        format: [labelWidthMm, labelHeightMm],
        orientation,
        compress: true
      });

      for (let index = 0; index < selectedEquipment.length; index += 1) {
        const item = selectedEquipment[index];
        if (index > 0) document.addPage([labelWidthMm, labelHeightMm], orientation);
        const scanUrl = new URL(
          `/${locale}/equipment/${encodeURIComponent(item.qrToken)}`,
          window.location.origin
        ).toString();
        const label = await renderLabelCanvas({
          item,
          scanUrl,
          widthMm: labelWidthMm,
          heightMm: labelHeightMm,
          layout,
          includeName,
          includeUid,
          logo,
          logoPlacement,
          background,
          backgroundOpacity
        });
        document.addImage(
          label.toDataURL("image/png"),
          "PNG",
          0,
          0,
          labelWidthMm,
          labelHeightMm,
          undefined,
          "FAST"
        );
      }

      document.save(`equipment-qr-labels-${new Date().toISOString().slice(0, 10)}.pdf`);
      setMessage({ kind: "success", text: t("downloadReady") });
    } catch {
      setMessage({ kind: "error", text: t("downloadError") });
    } finally {
      setExporting(null);
    }
  }

  async function downloadPng() {
    if (!layout || selectedEquipment.length === 0) {
      setMessage({
        kind: "error",
        text: layout ? t("selectBeforeDownload") : t("labelInvalid")
      });
      return;
    }
    setExporting("png");
    setMessage(null);
    try {
      const [logo, background] = await Promise.all([
        includeLogo && logoUrl ? loadImage(logoUrl) : Promise.resolve(null),
        backgroundUrl ? loadImage(backgroundUrl) : Promise.resolve(null)
      ]);
      for (const item of selectedEquipment) {
        const scanUrl = new URL(
          `/${locale}/equipment/${encodeURIComponent(item.qrToken)}`,
          window.location.origin
        ).toString();
        const label = await renderLabelCanvas({
          item,
          scanUrl,
          widthMm: labelWidthMm,
          heightMm: labelHeightMm,
          layout,
          includeName,
          includeUid,
          logo,
          logoPlacement,
          background,
          backgroundOpacity
        });
        triggerDownload(
          await canvasBlob(label),
          `${safeFileName(item.name)}-qr-label.png`
        );
      }
      setMessage({
        kind: "success",
        text: t("pngDownloadReady", { count: selectedEquipment.length })
      });
    } catch {
      setMessage({ kind: "error", text: t("pngDownloadError") });
    } finally {
      setExporting(null);
    }
  }

  const logoTop = layout ? (layout.paddingMm / labelHeightMm) * 100 : 0;
  const qrTop = layout
    ? ((layout.paddingMm + layout.logoSlotMm) / labelHeightMm) * 100
    : 0;
  const qrWidth = layout ? (layout.qrSizeMm / labelWidthMm) * 100 : 0;
  const qrHeight = layout ? (layout.qrSizeMm / labelHeightMm) * 100 : 0;
  const nameTop = layout
    ? ((layout.paddingMm + layout.logoSlotMm + layout.qrSizeMm) / labelHeightMm) * 100
    : 0;
  const uidTop = layout
    ? ((layout.paddingMm + layout.logoSlotMm + layout.qrSizeMm + layout.nameSlotMm) / labelHeightMm) * 100
    : 0;
  const previewTextSizeCqw = layout
    ? ((layout.textSizePt * (25.4 / 72)) / labelWidthMm) * 100
    : 0;
  const previewUidTextSizeCqw = layout
    ? ((layout.uidTextSizePt * (25.4 / 72)) / labelWidthMm) * 100
    : 0;
  const centerLogoBoxMm = layout
    ? layout.logoHeightMm + CENTER_LOGO_BACKING_MM
    : 0;
  const centerLogoTop = layout
    ? ((layout.paddingMm + layout.logoSlotMm + layout.qrSizeMm / 2) / labelHeightMm) * 100
    : 0;
  const centerLogoInnerRatio = centerLogoBoxMm > 0
    ? (layout?.logoHeightMm || 0) / centerLogoBoxMm
    : 0;

  function renderLabelPreview() {
    if (!layout) {
      return <div className="flex h-full items-center justify-center p-4 text-center text-sm text-fg-subtle">{t("labelInvalid")}</div>;
    }
    return (
      <div className="relative mx-auto h-full max-h-full max-w-full overflow-hidden bg-white shadow-[0_0_0_1px_rgba(33,29,24,0.12),0_8px_24px_rgba(33,29,24,0.10)] [container-type:inline-size]" style={{ aspectRatio: `${labelWidthMm} / ${labelHeightMm}` }} aria-label={t("previewAria")}>
        {backgroundUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={backgroundUrl}
            alt=""
            className="absolute inset-0 size-full object-cover"
            style={{ opacity: Math.min(1, Math.max(0, backgroundOpacity / 100)) }}
          />
        )}
        {previewItem ? <>
          {includeLogo && logoUrl && logoPlacement === "ABOVE" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="absolute left-1/2 max-w-[70%] -translate-x-1/2 object-contain" style={{ top: `${logoTop}%`, height: `${(layout.logoHeightMm / labelHeightMm) * 100}%` }} />
          )}
          {previewQrs[previewItem.id] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewQrs[previewItem.id]} alt="" className="absolute left-1/2 -translate-x-1/2 object-contain [image-rendering:pixelated]" style={{ top: `${qrTop}%`, width: `${qrWidth}%`, height: `${qrHeight}%` }} />
          ) : <div className="absolute left-1/2 -translate-x-1/2 bg-[#f0ede7]" style={{ top: `${qrTop}%`, width: `${qrWidth}%`, height: `${qrHeight}%` }} />}
          {includeLogo && logoUrl && logoPlacement === "CENTER" && previewQrs[previewItem.id] && (
            <span
              aria-hidden="true"
              className="absolute left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center bg-white"
              style={{
                top: `${centerLogoTop}%`,
                width: `${(centerLogoBoxMm / labelWidthMm) * 100}%`,
                height: `${(centerLogoBoxMm / labelHeightMm) * 100}%`
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt=""
                className="object-contain"
                style={{
                  width: `${centerLogoInnerRatio * 100}%`,
                  height: `${centerLogoInnerRatio * 100}%`
                }}
              />
            </span>
          )}
          {includeName && <span className="absolute left-[4%] right-[4%] flex items-center justify-center truncate text-center font-semibold leading-tight text-[#211d18]" style={{ top: `${nameTop}%`, height: `${(layout.nameSlotMm / labelHeightMm) * 100}%`, fontSize: `${previewTextSizeCqw}cqw` }}>{previewItem.name}</span>}
          {includeUid && <span className="absolute left-[4%] right-[4%] flex items-center justify-center truncate text-center font-meta font-medium leading-tight text-[#514a41]" style={{ top: `${uidTop}%`, height: `${(layout.uidSlotMm / labelHeightMm) * 100}%`, fontSize: `${previewUidTextSizeCqw}cqw` }}>{equipmentUid(previewItem)}</span>}
        </> : <span className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs font-semibold text-[#6f665b] sm:text-sm">{t("previewEmpty")}</span>}
      </div>
    );
  }

  return (
    <div className={`relative grid items-start gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(20rem,0.85fr)] lg:pb-0 xl:grid-cols-[minmax(0,0.9fr)_minmax(24rem,1.1fr)] ${mobilePreviewExpanded ? "pb-[22rem]" : "pb-24"}`}>
      <div className="flex min-w-0 flex-col gap-6">
        <section className="ui-panel p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="font-meta mt-1 text-[0.6875rem] font-semibold tracking-[0.16em] text-accent">01</span>
            <div>
              <h2 className="font-display text-[1.375rem] font-semibold tracking-[-0.02em] text-fg">{t("setupTitle")}</h2>
              <p className="ui-pretty mt-1 text-sm leading-6 text-fg-subtle">{t("setupHint")}</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-raised p-3 transition-[border-color,background-color] hover:border-accent/40">
              <label className="flex min-h-12 cursor-pointer items-start gap-3">
                <input type="checkbox" checked={includeName} onChange={(event) => setIncludeName(event.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[var(--color-accent)]" />
                <span>
                  <span className="block text-sm font-semibold text-fg">{t("includeName")}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-fg-subtle">{t("includeNameHint")}</span>
                </span>
              </label>
              <div className={`mt-3 border-t border-border pt-3 ${includeName ? "" : "opacity-50"}`}>
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="qr-label-text-size" className="text-xs font-semibold text-fg-muted">{t("textSize")}</label>
                  <output htmlFor="qr-label-text-size" className="font-meta text-xs text-fg-subtle">{t("textSizeValue", { size: textSizeInput || "—" })}</output>
                </div>
                <input id="qr-label-text-size" type="range" min={QR_LABEL_MIN_TEXT_SIZE_PT} max={QR_LABEL_MAX_TEXT_SIZE_PT} step="1" value={textSizeInput} disabled={!includeName} onChange={(event) => setTextSizeInput(event.target.value)} className="mt-2 h-8 w-full cursor-pointer accent-[var(--color-accent)] disabled:cursor-not-allowed" />
              </div>
              <label className="mt-3 flex min-h-12 cursor-pointer items-start gap-3 border-t border-border pt-3">
                <input type="checkbox" checked={includeUid} onChange={(event) => setIncludeUid(event.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[var(--color-accent)]" />
                <span>
                  <span className="block text-sm font-semibold text-fg">{t("includeUid")}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-fg-subtle">{t("includeUidHint")}</span>
                </span>
              </label>
            </div>
            <div className={`rounded-lg border border-border bg-raised p-3 transition-[border-color,background-color] ${logoUrl ? "hover:border-accent/40" : "opacity-60"}`}>
              <label className={`flex min-h-12 items-start gap-3 ${logoUrl ? "cursor-pointer" : "cursor-not-allowed"}`}>
                <input type="checkbox" checked={includeLogo} disabled={!logoUrl} onChange={(event) => setIncludeLogo(event.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[var(--color-accent)]" />
                <span>
                  <span className="block text-sm font-semibold text-fg">{t("includeLogo")}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-fg-subtle">{logoUrl ? t("includeLogoHint") : t("logoMissing")}</span>
                </span>
              </label>
              <div className={`mt-3 border-t border-border pt-3 ${includeLogo && logoUrl ? "" : "opacity-50"}`}>
                <fieldset disabled={!includeLogo || !logoUrl}>
                  <legend className="text-xs font-semibold text-fg-muted">{t("logoPlacement")}</legend>
                  <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-control p-1">
                    {(["ABOVE", "CENTER"] as const).map((placement) => (
                      <label
                        key={placement}
                        className={`flex min-h-10 cursor-pointer items-center justify-center rounded-md px-2 text-center text-xs font-semibold transition-[color,background-color] focus-within:ring-2 focus-within:ring-accent/45 ${
                          logoPlacement === placement
                            ? "bg-raised text-fg"
                            : "text-fg-subtle hover:text-fg"
                        } disabled:cursor-not-allowed`}
                      >
                        <input
                          type="radio"
                          name="logo-placement"
                          value={placement}
                          checked={logoPlacement === placement}
                          onChange={() => setLogoPlacement(placement)}
                          className="sr-only"
                        />
                        {placement === "ABOVE" ? t("logoPlacementAbove") : t("logoPlacementCenter")}
                      </label>
                    ))}
                  </div>
                  {logoPlacement === "CENTER" && (
                    <p className="mt-2 text-xs leading-5 text-fg-subtle">{t("logoPlacementCenterHint")}</p>
                  )}
                </fieldset>
                <div className="mt-3 border-t border-border pt-3">
                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor="qr-label-logo-size" className="text-xs font-semibold text-fg-muted">{t("logoSize")}</label>
                    <output htmlFor="qr-label-logo-size" className="font-meta text-xs text-fg-subtle">{t("logoSizeValue", { size: logoHeightInput || "—" })}</output>
                  </div>
                  <input id="qr-label-logo-size" type="range" min={QR_LABEL_MIN_LOGO_HEIGHT_MM} max={layout?.logoHeightLimitMm || QR_LABEL_MAX_LOGO_HEIGHT_MM} step="0.5" value={logoHeightInput} disabled={!includeLogo || !logoUrl} onChange={(event) => setLogoHeightInput(event.target.value)} className="mt-2 h-8 w-full cursor-pointer accent-[var(--color-accent)] disabled:cursor-not-allowed" />
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-raised p-3 transition-[border-color,background-color] hover:border-accent/40 sm:col-span-2">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <span className="block text-sm font-semibold text-fg">{t("labelBackground")}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-fg-subtle">{t("labelBackgroundHint")}</span>
                  {backgroundName && <span className="font-meta mt-1 block truncate text-[0.6875rem] text-accent">{backgroundName}</span>}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <label className={buttonClasses({ size: "compact", className: "cursor-pointer" })}>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      onChange={(event) => {
                        void chooseBackground(event.target.files?.[0]);
                        event.target.value = "";
                      }}
                    />
                    {backgroundUrl ? t("replaceBackground") : t("uploadBackground")}
                  </label>
                  {backgroundUrl && <Button size="compact" variant="ghost" onClick={removeBackground}>{t("removeBackground")}</Button>}
                </div>
              </div>
              <div className={`mt-3 border-t border-border pt-3 ${backgroundUrl ? "" : "opacity-50"}`}>
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="qr-label-background-opacity" className="text-xs font-semibold text-fg-muted">{t("backgroundOpacity")}</label>
                  <output htmlFor="qr-label-background-opacity" className="font-meta text-xs text-fg-subtle">{t("backgroundOpacityValue", { opacity: backgroundOpacityInput || "—" })}</output>
                </div>
                <input id="qr-label-background-opacity" type="range" min="0" max="100" step="5" value={backgroundOpacityInput} disabled={!backgroundUrl} onChange={(event) => setBackgroundOpacityInput(event.target.value)} className="mt-2 h-8 w-full cursor-pointer accent-[var(--color-accent)] disabled:cursor-not-allowed" />
              </div>
            </div>
          </div>
          {!logoUrl && <Link href="/dashboard/settings" className="mt-3 inline-flex min-h-10 items-center text-sm font-semibold text-accent hover:text-accent-strong">{t("openSiteSettings")}</Link>}

          <div className="mt-6 border-t border-border pt-5">
            <h3 className="text-sm font-semibold text-fg">{t("labelSize")}</h3>
            <p className="mt-1 text-xs leading-5 text-fg-subtle">{t("labelSizeHint")}</p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="grid min-w-0 flex-1 grid-cols-[1fr_auto_1fr] items-end gap-2">
                <Field label={t("labelWidth")} htmlFor="qr-label-width">
                  <Input id="qr-label-width" type="number" inputMode="decimal" min={QR_LABEL_MIN_SIZE_MM} max={QR_LABEL_MAX_SIZE_MM} step="0.1" value={widthInput} onChange={(event) => { setWidthInput(event.target.value); setSizeNotice(""); }} />
                </Field>
                <Button size="compact" className="mb-0.5 size-11 px-0" aria-label={t("swapDimensions")} title={t("swapDimensions")} onClick={() => { setWidthInput(heightInput); setHeightInput(widthInput); setSizeNotice(""); }}>
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m7 7 3-3m-3 3 3 3M7 7h10M17 17l-3-3m3 3-3 3m3-3H7" /></svg>
                </Button>
                <Field label={t("labelHeight")} htmlFor="qr-label-height">
                  <Input id="qr-label-height" type="number" inputMode="decimal" min={QR_LABEL_MIN_SIZE_MM} max={QR_LABEL_MAX_SIZE_MM} step="0.1" value={heightInput} onChange={(event) => { setHeightInput(event.target.value); setSizeNotice(""); }} />
                </Field>
              </div>
              <Button variant={sizeChanged ? "primary" : "secondary"} onClick={saveSize} disabled={!layout} className="sm:shrink-0">{t("saveSize")}</Button>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="font-meta text-xs text-fg-muted">
                {t("savedSize", { width: savedSize.widthMm, height: savedSize.heightMm })}
                {sizeChanged && <span className="text-warning"> · {t("unsavedSize")}</span>}
              </p>
              {layout && <p className="font-meta text-xs text-fg-subtle">{t("qrSize", { size: Math.round(layout.qrSizeMm * 10) / 10 })}</p>}
            </div>
            <div aria-live="polite" className="mt-2 min-h-5">{sizeNotice && <p className="text-sm font-semibold text-success">{sizeNotice}</p>}</div>
            {!layout && <p className="mt-2 rounded-lg border border-danger-border bg-danger-surface px-3 py-2 text-sm text-danger" role="alert">{t("labelInvalid")}</p>}
          </div>
        </section>

        <section className="ui-panel p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="font-meta mt-1 text-[0.6875rem] font-semibold tracking-[0.16em] text-accent">02</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-[1.375rem] font-semibold tracking-[-0.02em] text-fg">{t("selectTitle")}</h2>
                <span className="font-meta text-xs text-accent">{t("selectedCount", { count: selectedEquipment.length })}</span>
              </div>
              <p className="ui-pretty mt-1 text-sm leading-6 text-fg-subtle">{t("selectHint")}</p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm font-semibold text-fg-muted"><span>{t("search")}</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("searchPlaceholder")} className={controlClasses} /></label>
            <label className="flex flex-col gap-2 text-sm font-semibold text-fg-muted"><span>{t("category")}</span><select value={category} onChange={(event) => setCategory(event.target.value)} className={controlClasses}><option value="ALL">{t("allCategories")}</option>{categories.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="compact" onClick={() => updateSelection(filteredEquipment.map((item) => item.id), true)} disabled={filteredEquipment.length === 0}>{t("selectVisible", { count: filteredEquipment.length })}</Button>
            <Button size="compact" variant="ghost" onClick={() => setSelectedIds(new Set())} disabled={selectedEquipment.length === 0}>{t("clearSelection")}</Button>
          </div>
          {equipment.length === 0 ? (
            <div className="mt-5 rounded-xl border border-dashed border-border-strong bg-control p-5 text-center"><p className="text-sm text-fg-subtle">{t("emptyInventory")}</p><Link href="/dashboard/equipment/new" className={buttonClasses({ variant: "primary", className: "mt-4" })}>{t("addEquipment")}</Link></div>
          ) : filteredEquipment.length === 0 ? (
            <p className="mt-5 rounded-lg bg-control p-4 text-center text-sm text-fg-subtle">{t("noMatches")}</p>
          ) : (
            <ul className="mt-5 max-h-[28rem] divide-y divide-border overflow-y-auto border-y border-border">
              {filteredEquipment.map((item, index) => {
                const checked = selectedIds.has(item.id);
                return <li key={item.id}><label className={`flex min-h-14 cursor-pointer items-center gap-3 px-2 py-2 transition-colors hover:bg-accent-surface ${checked ? "bg-accent-surface" : ""}`}><input type="checkbox" checked={checked} onChange={(event) => updateSelection([item.id], event.target.checked)} className="size-5 shrink-0 accent-[var(--color-accent)]" /><span className="font-meta w-7 shrink-0 text-[0.6875rem] text-fg-faint">{String(index + 1).padStart(2, "0")}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-fg">{item.name}</span><span className="mt-0.5 block truncate text-xs text-fg-subtle">{item.category}</span></span><span className="font-meta hidden text-[0.625rem] text-fg-faint sm:block">{equipmentUid(item)}</span></label></li>;
              })}
            </ul>
          )}
        </section>
      </div>

      <aside className="ui-panel-raised hidden min-w-0 self-start p-6 lg:sticky lg:top-6 lg:block">
        <div className="flex items-start gap-3">
          <span className="font-meta mt-1 text-[0.6875rem] font-semibold tracking-[0.16em] text-accent">03</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="font-display text-lg font-semibold tracking-[-0.02em] text-fg lg:text-[1.375rem]">{t("previewTitle")}</h2><span className="font-meta text-[0.6875rem] text-fg-subtle">{widthInput || "—"} × {heightInput || "—"} MM</span></div>
            <p className="ui-pretty mt-1 hidden text-sm leading-6 text-fg-subtle lg:block">{t("previewHint")}</p>
          </div>
        </div>
        <div className="mt-3 flex h-[min(28vh,14rem)] items-center justify-center rounded-xl bg-control p-3 lg:mt-5 lg:h-[min(52vh,32rem)] lg:p-6">
          {renderLabelPreview()}
        </div>
        <div className="mt-2 flex min-h-10 items-center justify-between gap-3 lg:mt-4">
          <Button size="compact" variant="ghost" disabled={safePreviewIndex === 0} onClick={() => setPreviewIndex((index) => Math.max(0, index - 1))}>{t("previousLabel")}</Button>
          <span className="font-meta text-xs text-fg-muted">{t("labelSummary", { current: safePreviewIndex + 1, total: totalPreviews })}</span>
          <Button size="compact" variant="ghost" disabled={safePreviewIndex >= totalPreviews - 1} onClick={() => setPreviewIndex((index) => Math.min(totalPreviews - 1, index + 1))}>{t("nextLabel")}</Button>
        </div>
        <div className="mt-3 border-t border-border pt-3 lg:mt-5 lg:pt-5">
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="primary" className="w-full" disabled={Boolean(exporting) || !layout || selectedEquipment.length === 0} onClick={downloadPdf}>{exporting === "pdf" ? t("preparingPdf") : t("downloadPdf", { count: selectedEquipment.length })}</Button>
            <Button className="w-full" disabled={Boolean(exporting) || !layout || selectedEquipment.length === 0} onClick={downloadPng}>{exporting === "png" ? t("preparingPng") : t("downloadPng", { count: selectedEquipment.length })}</Button>
          </div>
          <p className="mt-3 hidden text-center text-xs leading-5 text-fg-subtle lg:block">{t("printHint")}</p>
          <div aria-live="polite" className="mt-3 min-h-6">{message && <p className={`rounded-lg border px-3 py-2 text-sm ${message.kind === "success" ? "border-success-border bg-success-surface text-success" : "border-danger-border bg-danger-surface text-danger"}`}>{message.text}</p>}</div>
        </div>
      </aside>

      <aside className="ui-panel-raised fixed bottom-4 right-4 z-40 w-[min(13rem,calc(100vw-2rem))] p-3 shadow-[0_16px_48px_rgba(0,0,0,0.28)] lg:hidden" aria-label={t("previewAria")}>
        <div className="flex min-h-11 items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="font-meta text-[0.625rem] font-semibold tracking-[0.16em] text-accent">03</span>
              <h2 className="truncate text-sm font-semibold text-fg">{t("previewTitle")}</h2>
            </div>
            <p className="font-meta mt-0.5 text-[0.625rem] text-fg-subtle">{widthInput || "—"} × {heightInput || "—"} MM</p>
          </div>
          <Button size="compact" variant="ghost" className="size-11 shrink-0 px-0" aria-label={mobilePreviewExpanded ? t("collapsePreview") : t("expandPreview")} title={mobilePreviewExpanded ? t("collapsePreview") : t("expandPreview")} aria-expanded={mobilePreviewExpanded} onClick={() => setMobilePreviewExpanded((expanded) => !expanded)}>
            <svg aria-hidden="true" viewBox="0 0 24 24" className={`size-4 transition-transform duration-150 motion-reduce:transition-none ${mobilePreviewExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m7 10 5 5 5-5" /></svg>
          </Button>
        </div>
        {mobilePreviewExpanded && (
          <div>
            <div className="mt-2 flex h-36 items-center justify-center rounded-lg bg-control p-2">
              {renderLabelPreview()}
            </div>
            <div className="mt-1 flex min-h-11 items-center justify-between gap-2">
              <Button size="compact" variant="ghost" className="size-11 px-0" aria-label={t("previousLabel")} title={t("previousLabel")} disabled={safePreviewIndex === 0} onClick={() => setPreviewIndex((index) => Math.max(0, index - 1))}>
                <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m15 18-6-6 6-6" /></svg>
              </Button>
              <span className="font-meta text-[0.625rem] text-fg-muted">{t("labelSummary", { current: safePreviewIndex + 1, total: totalPreviews })}</span>
              <Button size="compact" variant="ghost" className="size-11 px-0" aria-label={t("nextLabel")} title={t("nextLabel")} disabled={safePreviewIndex >= totalPreviews - 1} onClick={() => setPreviewIndex((index) => Math.min(totalPreviews - 1, index + 1))}>
                <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m9 18 6-6-6-6" /></svg>
              </Button>
            </div>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <Button variant="primary" size="compact" className="w-full" disabled={Boolean(exporting) || !layout || selectedEquipment.length === 0} onClick={downloadPdf}>{exporting === "pdf" ? t("preparingShort") : t("mobileDownloadPdf")}</Button>
              <Button size="compact" className="w-full" disabled={Boolean(exporting) || !layout || selectedEquipment.length === 0} onClick={downloadPng}>{exporting === "png" ? t("preparingShort") : t("mobileDownloadPng")}</Button>
            </div>
            <div aria-live="polite" className="mt-2">{message && <p className={`rounded-lg border px-2 py-1.5 text-xs ${message.kind === "success" ? "border-success-border bg-success-surface text-success" : "border-danger-border bg-danger-surface text-danger"}`}>{message.text}</p>}</div>
          </div>
        )}
      </aside>
    </div>
  );
}
