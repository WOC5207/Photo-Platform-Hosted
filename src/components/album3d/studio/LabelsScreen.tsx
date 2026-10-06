"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  calculateEquipmentQrLabelLayout,
  QR_LABEL_MAX_ELEMENT_GAP_MM,
  QR_LABEL_MAX_LOGO_HEIGHT_MM,
  QR_LABEL_MAX_SIZE_MM,
  QR_LABEL_MAX_TEXT_SIZE_PT,
  QR_LABEL_MIN_ELEMENT_GAP_MM,
  QR_LABEL_MIN_LOGO_HEIGHT_MM,
  QR_LABEL_MIN_SIZE_MM,
  QR_LABEL_MIN_TEXT_SIZE_PT,
  type EquipmentQrLogoPlacement
} from "@/lib/equipmentQrSheet";
import {
  downloadLabelPdf,
  downloadLabelPngs,
  loadImage,
  outputSize,
  printLabels,
  renderLabel,
  type LabelArtwork,
  type LabelRotation
} from "@/lib/equipmentQrLabel";
import { Hints, Rolling, pad } from "../hud";
import styles from "../ArchiveSite.module.css";
import { BookingPanel, StepButtons, fieldClass, isInteractive, metaLabel, primaryClass, secondaryClass, useScene, useScreenKeys, useStage, useStageInput } from "../booking/shared";
import { paintBlankPoster } from "../creators/shared";
import { RAIL_PICK } from "../types";
import { useImages } from "./gear";
import { FormNote, StudioHeading } from "./shared";
import type { StudioAccount, StudioLabels } from "./types";

/** The classic label tool's saved size, so both sites start from the same label. */
const STORAGE_KEY = "photo-platform:equipment-qr-label-size:v2";
const DEFAULT_SIZE = { widthMm: 50, heightMm: 70 };
const MAX_BACKGROUND_BYTES = 12 * 1024 * 1024;

function Group({ title, meta, open = false, children }: { title: string; meta?: ReactNode; open?: boolean; children: ReactNode }) {
  return (
    <details open={open} className="group border-t border-border">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        <span className="flex-1">{title}</span>
        {meta && <span className="font-meta text-[0.625rem] uppercase tracking-[0.12em] text-fg-subtle">{meta}</span>}
        <span aria-hidden="true" className="transition group-open:rotate-45">+</span>
      </summary>
      <div className="grid gap-3 pb-4">{children}</div>
    </details>
  );
}

function Range({ label, value, min, max, step, disabled, onChange }: { label: string; value: string; min: number; max: number; step: number; disabled?: boolean; onChange: (v: string) => void }) {
  return (
    <label className={`grid gap-1 text-xs font-semibold text-fg-muted ${disabled ? "opacity-50" : ""}`}>
      <span className="flex justify-between">
        {label}
        <span className="font-meta font-normal text-fg-subtle">{value || "—"}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="h-8 w-full accent-[var(--color-accent)]" />
    </label>
  );
}

function Check({ label, hint, checked, disabled, onChange }: { label: string; hint?: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={`flex items-start gap-3 text-sm ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]" />
      <span>
        <span className="block font-semibold">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-fg-subtle">{hint}</span>}
      </span>
    </label>
  );
}

/**
 * The QR label sheet: the inventory stands on the rail in front of the
 * easel, Enter (or a tap on the focused card) puts an item's label on the
 * sheet or takes it off, and the easel shows the focused item's finished
 * label, drawn by the same code that prints it. The panel sets the label up
 * as the classic tool does; printing slides the label into the slot while
 * the PDF, the PNGs or the print dialog are prepared.
 */
export default function LabelsScreen({ account, labels }: { account: StudioAccount; labels: StudioLabels }) {
  const t = useTranslations("album3d");
  const tq = useTranslations("equipmentQrPrint");
  const locale = useLocale();
  const { path, key, touch } = useStage();
  const scene = useScene("poster");
  const image = useImages();
  const { username } = account;
  const { logoUrl } = labels;

  const [selected, setSelected] = useState(() => new Set(labels.selected));
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [focusId, setFocusId] = useState(labels.selected[0] ?? labels.items[0]?.id ?? "");
  const [includeName, setIncludeName] = useState(true);
  const [includeUid, setIncludeUid] = useState(false);
  const [includeLogo, setIncludeLogo] = useState(Boolean(logoUrl));
  const [placement, setPlacement] = useState<EquipmentQrLogoPlacement>("ABOVE");
  const [nameSize, setNameSize] = useState("10");
  const [uidSize, setUidSize] = useState("10");
  const [logoSize, setLogoSize] = useState("7");
  const [gap, setGap] = useState("3");
  const [background, setBackground] = useState({ url: "", name: "" });
  const [opacity, setOpacity] = useState("30");
  const [width, setWidth] = useState(String(DEFAULT_SIZE.widthMm));
  const [height, setHeight] = useState(String(DEFAULT_SIZE.heightMm));
  const [savedSize, setSavedSize] = useState(DEFAULT_SIZE);
  const [rotation, setRotation] = useState<LabelRotation>(0);
  const [busy, setBusy] = useState<"pdf" | "png" | "print" | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const backgroundRef = useRef("");

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null") as { widthMm?: unknown; heightMm?: unknown } | null;
      if (stored && typeof stored.widthMm === "number" && typeof stored.heightMm === "number") {
        setWidth(String(stored.widthMm));
        setHeight(String(stored.heightMm));
        setSavedSize({ widthMm: stored.widthMm, heightMm: stored.heightMm });
      }
    } catch {
      // A bad saved size falls back to 50 × 70 mm.
    }
  }, []);
  useEffect(() => () => {
    if (backgroundRef.current) URL.revokeObjectURL(backgroundRef.current);
  }, []);

  const items = useMemo(() => {
    const q = query.trim().toLocaleLowerCase(locale);
    return labels.items.filter(
      (item) => (!category || item.category === category) && (!q || item.name.toLocaleLowerCase(locale).includes(q) || item.category.toLocaleLowerCase(locale).includes(q))
    );
  }, [labels.items, category, query, locale]);
  const index = Math.max(0, items.findIndex((item) => item.id === focusId));
  const item = items[index] ?? null;
  const chosen = useMemo(() => labels.items.filter((i) => selected.has(i.id)), [labels.items, selected]);

  const layout = useMemo(
    () =>
      calculateEquipmentQrLabelLayout({
        labelWidthMm: Number(width),
        labelHeightMm: Number(height),
        includeName,
        includeUid,
        includeLogo: includeLogo && Boolean(logoUrl),
        logoPlacement: placement,
        nameTextSizePt: Number(nameSize),
        uidTextSizePt: Number(uidSize),
        logoHeightMm: Number(logoSize),
        elementGapMm: Number(gap)
      }),
    [width, height, includeName, includeUid, includeLogo, logoUrl, placement, nameSize, uidSize, logoSize, gap]
  );
  // A centred logo is held small enough to keep the code scannable.
  useEffect(() => {
    if (includeLogo && placement === "CENTER" && layout && Number(logoSize) > layout.logoHeightLimitMm) {
      setLogoSize(String(Math.floor(layout.logoHeightLimitMm * 10) / 10));
    }
  }, [includeLogo, placement, layout, logoSize]);

  const art = useMemo<LabelArtwork | null>(
    () =>
      layout && {
        widthMm: Number(width),
        heightMm: Number(height),
        layout,
        includeName,
        includeUid,
        logoUrl: includeLogo ? logoUrl : "",
        logoPlacement: placement,
        backgroundUrl: background.url,
        backgroundOpacity: Number(opacity),
        rotation
      },
    [layout, width, height, includeName, includeUid, includeLogo, logoUrl, placement, background.url, opacity, rotation]
  );
  const out = outputSize({ widthMm: Number(width), heightMm: Number(height), rotation });

  // ------------------------------------------------------------- scene --
  useEffect(() => {
    if (!scene) return;
    scene.setRail(
      items.length
        ? items.map((g) => ({ key: g.id, image: image(g.photoUrl), label: g.name, sub: selected.has(g.id) ? `✓ ${t("studioOnSheet")}` : g.category }))
        : null,
      index
    );
  }, [scene, items, index, selected, image, t]);
  useEffect(() => () => scene?.setRail(null, 0), [scene]);

  // The focused item's finished label, drawn as it prints.
  useEffect(() => {
    if (!scene) return;
    if (!art || !item) {
      paintBlankPoster(scene.setPoster("label:none", 5 / 7), art ? tq("previewEmpty") : t("studioLabelTooSmall"));
      scene.refresh();
      return;
    }
    let live = true;
    const timer = window.setTimeout(async () => {
      try {
        const [logo, back] = await Promise.all([art.logoUrl ? loadImage(art.logoUrl) : null, art.backgroundUrl ? loadImage(art.backgroundUrl) : null]);
        const label = await renderLabel(item, art, locale, { logo, background: back });
        if (!live) return;
        const size = outputSize(art);
        const canvas = scene.setPoster(`label:${size.widthMm}x${size.heightMm}`, size.widthMm / size.heightMm, 1600);
        const c = canvas.getContext("2d");
        c?.drawImage(label, 0, 0, canvas.width, canvas.height);
        scene.refresh();
      } catch {
        if (live) setMessage({ tone: "error", text: tq("previewError") });
      }
    }, 120);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [scene, art, item, locale, t, tq]);

  // ---------------------------------------------------------- controls --
  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setMessage(null);
  };
  const turn = (delta: number) => {
    const next = items[Math.max(0, Math.min(items.length - 1, index + delta))];
    if (next) setFocusId(next.id);
  };

  useScreenKeys((k, target) => {
    if (k === "ArrowLeft" || k === "ArrowUp") turn(-1);
    else if (k === "ArrowRight" || k === "ArrowDown") turn(1);
    else if (k === "Enter" && item && !isInteractive(target)) toggle(item.id);
    else return false;
    return true;
  });
  useStageInput((input) => {
    if (busy) return;
    if (input.kind === "pick" && input.index >= RAIL_PICK) {
      const picked = items[input.index - RAIL_PICK];
      if (!picked) return;
      if (picked.id === item?.id) toggle(picked.id);
      else setFocusId(picked.id);
    } else if (input.kind === "pick" && input.index === 0 && item) toggle(item.id);
    else if (input.kind === "wheel") turn(input.direction);
    else if (input.kind === "swipe" && input.x) turn(input.x);
  });

  async function chooseBackground(file: File | undefined) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > MAX_BACKGROUND_BYTES) {
      setMessage({ tone: "error", text: tq("backgroundUploadError") });
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      await loadImage(url);
      if (backgroundRef.current) URL.revokeObjectURL(backgroundRef.current);
      backgroundRef.current = url;
      setBackground({ url, name: file.name });
      setMessage({ tone: "ok", text: tq("backgroundReady") });
    } catch {
      URL.revokeObjectURL(url);
      setMessage({ tone: "error", text: tq("backgroundUploadError") });
    }
  }

  async function run(kind: "pdf" | "png" | "print") {
    if (!art || chosen.length === 0) {
      setMessage({ tone: "error", text: art ? tq(kind === "print" ? "selectBeforePrint" : "selectBeforeDownload") : tq("labelInvalid") });
      return;
    }
    setBusy(kind);
    setMessage(null);
    scene?.setPrinting(true);
    try {
      const slid = scene ? Promise.race([scene.whenPrinted(), new Promise<void>((resolve) => window.setTimeout(resolve, 4000))]) : null;
      const job = kind === "pdf" ? downloadLabelPdf(chosen, art, locale) : kind === "png" ? downloadLabelPngs(chosen, art, locale) : printLabels(chosen, art, locale);
      await Promise.all([job, slid]);
      if (kind === "pdf") setMessage({ tone: "ok", text: tq("downloadReady") });
      if (kind === "png") setMessage({ tone: "ok", text: tq("pngDownloadReady", { count: chosen.length }) });
    } catch {
      setMessage({ tone: "error", text: tq(kind === "pdf" ? "downloadError" : kind === "png" ? "pngDownloadError" : "printError") });
    } finally {
      scene?.setPrinting(false);
      setBusy(null);
    }
  }

  const sizeChanged = Number(width) !== savedSize.widthMm || Number(height) !== savedSize.heightMm;
  const disabled = Boolean(busy) || !art || chosen.length === 0;

  return (
    <>
      <BookingPanel expanded>
        <StudioHeading trail={t("studioEquipment")} title={t("studioLabels")} />
        <p className="mt-4 text-sm text-fg-muted">{tq("description")}</p>

        <section aria-labelledby="studio-label-pick" className="mt-6 grid gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="studio-label-pick" className={metaLabel}>
              {tq("selectTitle")}
            </h2>
            <span className="font-meta text-[0.6875rem] uppercase tracking-[0.12em] text-accent-text">{tq("selectedCount", { count: chosen.length })}</span>
          </div>
          {labels.items.length === 0 ? (
            <p className="text-sm text-fg-muted">{tq("emptyInventory")}</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1 text-xs font-semibold text-fg-muted">
                  {tq("search")}
                  <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tq("searchPlaceholder")} className={fieldClass} />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-fg-muted">
                  {tq("category")}
                  <select value={category} onChange={(e) => setCategory(e.target.value)} className={fieldClass}>
                    <option value="">{tq("allCategories")}</option>
                    {labels.categories.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {item ? (
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border border-border-strong bg-page/70 px-3 py-2">
                  {items.length > 1 && <StepButtons onStep={turn} atStart={index === 0} atEnd={index >= items.length - 1} />}
                  <div className="min-w-[8rem] flex-1">
                    <p className={metaLabel}>
                      <Rolling value={pad(index + 1)} /> / {pad(items.length)}
                    </p>
                    <p className="truncate text-sm font-semibold">{item.name}</p>
                  </div>
                  <button type="button" aria-pressed={selected.has(item.id)} onClick={() => toggle(item.id)} className={secondaryClass}>
                    {selected.has(item.id) ? t("studioOffSheet") : t("studioToSheet")}
                  </button>
                </div>
              ) : (
                <p className="text-sm text-fg-subtle">{tq("noMatches")}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={items.length === 0}
                  onClick={() => setSelected((current) => new Set([...current, ...items.map((i) => i.id)]))}
                  className={`${secondaryClass} text-xs`}
                >
                  {tq("selectVisible", { count: items.length })}
                </button>
                <button type="button" disabled={chosen.length === 0} onClick={() => setSelected(new Set())} className={`${secondaryClass} text-xs`}>
                  {tq("clearSelection")}
                </button>
              </div>
            </>
          )}
          <Link href={`${path({ kind: "studio", username, page: "equipmentNew" })}?for=labels`} scroll={false} className="text-sm font-semibold underline-offset-4 hover:underline">
            + {tq("addEquipment")}
          </Link>
        </section>

        <div className="mt-6 grid">
          <Group title={tq("labelContent")} meta={tq("enabledOptions", { count: Number(includeName) + Number(includeUid) + Number(includeLogo && Boolean(logoUrl)) })}>
            <Check label={tq("includeName")} hint={tq("includeNameHint")} checked={includeName} onChange={setIncludeName} />
            <Range label={tq("nameTextSize")} value={nameSize} min={QR_LABEL_MIN_TEXT_SIZE_PT} max={QR_LABEL_MAX_TEXT_SIZE_PT} step={1} disabled={!includeName} onChange={setNameSize} />
            <Check label={tq("includeUid")} hint={tq("includeUidHint")} checked={includeUid} onChange={setIncludeUid} />
            <Range label={tq("uidTextSize")} value={uidSize} min={QR_LABEL_MIN_TEXT_SIZE_PT} max={QR_LABEL_MAX_TEXT_SIZE_PT} step={1} disabled={!includeUid} onChange={setUidSize} />
            <Check label={tq("includeLogo")} hint={logoUrl ? tq("includeLogoHint") : tq("logoMissing")} checked={includeLogo} disabled={!logoUrl} onChange={setIncludeLogo} />
            <div role="radiogroup" aria-label={tq("logoPlacement")} className={`grid grid-cols-2 gap-1 ${includeLogo && logoUrl ? "" : "opacity-50"}`}>
              {(["ABOVE", "CENTER"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={placement === p}
                  disabled={!includeLogo || !logoUrl}
                  onClick={() => setPlacement(p)}
                  className={`min-h-10 text-xs font-semibold uppercase tracking-[0.06em] ${placement === p ? "bg-fg text-page" : "border border-border-strong"}`}
                >
                  {p === "ABOVE" ? tq("logoPlacementAbove") : tq("logoPlacementCenter")}
                </button>
              ))}
            </div>
            <Range
              label={tq("logoSize")}
              value={logoSize}
              min={QR_LABEL_MIN_LOGO_HEIGHT_MM}
              max={layout?.logoHeightLimitMm || QR_LABEL_MAX_LOGO_HEIGHT_MM}
              step={0.5}
              disabled={!includeLogo || !logoUrl}
              onChange={setLogoSize}
            />
          </Group>
          <Group title={tq("elementGap")} meta={tq("elementGapValue", { size: gap || "—" })}>
            <p className="text-xs text-fg-subtle">{tq("elementGapHint")}</p>
            <Range label={tq("elementGap")} value={gap} min={QR_LABEL_MIN_ELEMENT_GAP_MM} max={QR_LABEL_MAX_ELEMENT_GAP_MM} step={0.5} onChange={setGap} />
          </Group>
          <Group title={tq("labelBackground")} meta={background.name || tq("backgroundNone")}>
            <p className="text-xs text-fg-subtle">{tq("labelBackgroundHint")}</p>
            <div className="flex flex-wrap gap-2">
              <label className={`${secondaryClass} cursor-pointer text-xs focus-within:ring-2 focus-within:ring-accent/40`}>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    void chooseBackground(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                {background.url ? tq("replaceBackground") : tq("uploadBackground")}
              </label>
              {background.url && (
                <button
                  type="button"
                  onClick={() => {
                    if (backgroundRef.current) URL.revokeObjectURL(backgroundRef.current);
                    backgroundRef.current = "";
                    setBackground({ url: "", name: "" });
                  }}
                  className={`${secondaryClass} text-xs`}
                >
                  {tq("removeBackground")}
                </button>
              )}
            </div>
            <Range label={tq("backgroundOpacity")} value={opacity} min={0} max={100} step={5} disabled={!background.url} onChange={setOpacity} />
          </Group>
          <Group title={tq("labelSize")} meta={`${width || "—"} × ${height || "—"} MM`}>
            <p className="text-xs text-fg-subtle">{tq("labelSizeHint")}</p>
            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
              <label className="grid gap-1 text-xs font-semibold text-fg-muted">
                {tq("labelWidth")}
                <input type="number" inputMode="decimal" min={QR_LABEL_MIN_SIZE_MM} max={QR_LABEL_MAX_SIZE_MM} step="0.1" value={width} onChange={(e) => setWidth(e.target.value)} className={fieldClass} />
              </label>
              <button
                type="button"
                aria-label={tq("swapDimensions")}
                title={tq("swapDimensions")}
                onClick={() => {
                  setWidth(height);
                  setHeight(width);
                }}
                className={`${secondaryClass} justify-center px-3`}
              >
                ⇄
              </button>
              <label className="grid gap-1 text-xs font-semibold text-fg-muted">
                {tq("labelHeight")}
                <input type="number" inputMode="decimal" min={QR_LABEL_MIN_SIZE_MM} max={QR_LABEL_MAX_SIZE_MM} step="0.1" value={height} onChange={(e) => setHeight(e.target.value)} className={fieldClass} />
              </label>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-meta text-[0.6875rem] text-fg-muted">
                {tq("savedSize", { width: savedSize.widthMm, height: savedSize.heightMm })}
                {sizeChanged && <span className="text-warning"> · {tq("unsavedSize")}</span>}
              </p>
              <button
                type="button"
                disabled={!layout || !sizeChanged}
                onClick={() => {
                  const next = { widthMm: Number(width), heightMm: Number(height) };
                  try {
                    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
                  } catch {
                    // Private windows can refuse; the size still applies to this sheet.
                  }
                  setSavedSize(next);
                  setMessage({ tone: "ok", text: tq("sizeSaved") });
                }}
                className={`${secondaryClass} text-xs`}
              >
                {tq("saveSize")}
              </button>
            </div>
            {layout ? <p className="font-meta text-[0.6875rem] text-fg-subtle">{tq("qrSize", { size: Math.round(layout.qrSizeMm * 10) / 10 })}</p> : <FormNote tone="error">{tq("labelInvalid")}</FormNote>}
          </Group>
          <Group title={tq("printRotation")} meta={`${rotation}°`}>
            <p className="text-xs text-fg-subtle">{tq("printRotationHint")}</p>
            <div role="radiogroup" aria-label={tq("printRotation")} className="grid grid-cols-4 gap-1">
              {([0, 90, 180, 270] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={rotation === r}
                  onClick={() => setRotation(r)}
                  className={`font-meta min-h-10 text-xs ${rotation === r ? "bg-fg text-page" : "border border-border-strong"}`}
                >
                  {r}°
                </button>
              ))}
            </div>
            <p className="font-meta text-[0.6875rem] text-fg-muted">{tq("printOutputSize", { width: out.widthMm || "—", height: out.heightMm || "—" })}</p>
          </Group>
        </div>

        <section aria-label={tq("previewTitle")} aria-busy={Boolean(busy)} className="mt-4 grid gap-2 border-t border-border pt-5">
          <button type="button" disabled={disabled} onClick={() => void run("print")} className={primaryClass}>
            {busy === "print" ? tq("preparingPrint") : tq("printLabels", { count: chosen.length })}
            <span aria-hidden="true" className="text-lg">↓</span>
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={disabled} onClick={() => void run("pdf")} className={`${secondaryClass} text-xs`}>
              {busy === "pdf" ? tq("preparingShort") : tq("mobileDownloadPdf")}
            </button>
            <button type="button" disabled={disabled} onClick={() => void run("png")} className={`${secondaryClass} text-xs`}>
              {busy === "png" ? tq("preparingShort") : tq("mobileDownloadPng")}
            </button>
          </div>
          <p className="text-xs text-fg-subtle">{tq("printHint")}</p>
          <div aria-live="polite">{message && <FormNote tone={message.tone}>{message.text}</FormNote>}</div>
        </section>
      </BookingPanel>
      {!touch && items.length > 0 && (
        <Hints className={styles.menuHint} parts={[`← → ${t("hintSelect")}`, `${key("confirm")} ${t("studioHintSheet")}`, `${key("back")} ${t("hintBack")}`]} />
      )}
    </>
  );
}
