"use client";

import { lazy, Suspense, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { useTranslations } from "next-intl";
import type { SharingPosterComposition } from "@/lib/sharingPoster";
import type { SharepostStep } from "@/lib/siteMode";
import RangeField from "@/components/sharing-posters/PosterRangeField";
import SharingPosterCreditLayers from "@/components/sharing-posters/SharingPosterCreditLayers";
import { pad } from "../../hud";
import { fieldClass, secondaryClass, useStage } from "../../booking/shared";
import { PhoneBack, PhoneSheet, PhoneShell, PhoneToolbar, cssColor, fitCanvas, usePosterFit, type PhoneTool } from "../phone";
import { canShareFile, download, paintBlankPoster, printPoster, safeFilename, shareFile } from "../shared";
import { useSharepostStudio } from "./SharepostStudio";

// Only a saved project picks from galleries, so the public creator never loads it.
const SharepostGallery = lazy(() => import("./SharepostGallery"));

type Mode = "board" | "add" | "arrange" | "layout" | "style" | "credits" | "print";
type Frame = { key: string; label: string; width: number; height: number; adaptive?: boolean; custom?: boolean };
type Drag = { kind: "photo"; id: string; over: string | null; moved: boolean } | { kind: "credits"; x: number; start: number; travel: number };

const ACCEPT = "image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif";
const EDGES = [2160, 4096, 8192] as const;
const pressed = (on: boolean) => (on ? "border-fg bg-fg text-page" : "");

/**
 * Create Sharepost on a phone held upright, for the public creator and a
 * photographer's saved posters alike: the poster flat and as wide as the
 * screen instead of on the easel, the photographs in a strip under it, and
 * every tool in a bar at the foot from the start. Each step of the easel
 * (photographs, layout, credits, printing) is a tool here whose controls
 * open in a sheet between the poster and the bar, so the poster stays in
 * view. On the poster a tap picks a photograph, dragging it onto another
 * moves it there, and the credits drag along the bottom.
 */
export default function SharepostPhoneBoard({ step }: { step: "photos" | SharepostStep }) {
  const t = useTranslations("album3d");
  const ts = useTranslations("sharingPosters");
  const tc = useTranslations("common");
  const { go } = useStage();
  const studio = useSharepostStudio();
  const { composition, photos, tools, status, update, name, project } = studio;
  const [mode, setMode] = useState<Mode>(step === "photos" ? "board" : step);
  const [picked, setPicked] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [typing, setTyping] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLElement>(null);
  const max = tools?.SHARING_POSTER_MAX_PHOTOS ?? 9;
  const selected = photos.find((photo) => photo.photoId === picked) ?? photos[0] ?? null;
  const at = selected ? photos.indexOf(selected) : -1;
  const empty = !composition || composition.photos.length === 0 || photos.length === 0;

  // The bar steps aside while a field has the keyboard, so the poster keeps some room.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let frame = 0;
    const check = () => {
      const active = document.activeElement;
      setTyping(active instanceof HTMLTextAreaElement || (active instanceof HTMLInputElement && ["text", "number", "search"].includes(active.type)));
    };
    // Focus moving between fields passes through the page on the way.
    const later = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(check);
    };
    root.addEventListener("focusin", check);
    root.addEventListener("focusout", later);
    return () => {
      cancelAnimationFrame(frame);
      root.removeEventListener("focusin", check);
      root.removeEventListener("focusout", later);
    };
  }, [status]);

  // -------------------------------------------------------------- poster --
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pixels = composition && tools && !empty ? tools.sharingPosterPixelSize(composition) : null;
  const size = usePosterFit(frameRef, pixels ? pixels.width / pixels.height : 0.8);
  const [accent, setAccent] = useState("#a44f25");
  useEffect(() => {
    if (rootRef.current) setAccent(cssColor(rootRef.current, "--color-accent", "#a44f25"));
  }, [status]);

  const ringed = drag?.kind === "photo" ? (drag.over ?? drag.id) : selected?.photoId;
  const { draw } = studio;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || status !== "ready" || !size.width) return;
    // At most once a frame, however fast a slider moves.
    const frame = requestAnimationFrame(() => {
      fitCanvas(canvas, size.width, size.height);
      if (empty) paintBlankPoster(canvas, t("creatorAddPhotosBlank"));
      else draw(canvas, { selected: mode === "credits" || mode === "print" ? null : ringed, selectionColor: accent });
    });
    return () => cancelAnimationFrame(frame);
  }, [status, size, empty, draw, ringed, accent, mode, t]);

  const toPoster = (event: PointerEvent<HTMLCanvasElement>) => {
    const metrics = studio.metrics;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!metrics || !rect.width) return null;
    return { x: ((event.clientX - rect.left) / rect.width) * metrics.width, y: ((event.clientY - rect.top) / rect.height) * metrics.height };
  };
  const photoUnder = (point: { x: number; y: number }) =>
    studio.metrics?.photoRects.find((box) => point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height)?.id ?? null;
  const creditsX = composition?.style.creditsX ?? 0;
  const setCreditsX = (x: number) => update((value) => (value.style.creditsX === x ? value : { ...value, style: { ...value.style, creditsX: x } }));

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (drag || empty) return;
    const point = toPoster(event);
    if (!point) return;
    const text = studio.metrics?.text;
    if (text && point.x >= text.x && point.x <= text.x + text.width && point.y >= text.y - text.height * 0.2 && point.y <= text.y + text.height * 1.2) {
      event.currentTarget.setPointerCapture(event.pointerId);
      setDrag({ kind: "credits", x: point.x, start: creditsX, travel: text.travel });
      return;
    }
    const id = photoUnder(point);
    if (!id) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ kind: "photo", id, over: id, moved: false });
  };
  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const point = drag && toPoster(event);
    if (!drag || !point) return;
    if (drag.kind === "credits") {
      if (!tools || !studio.metrics) return;
      const raw = drag.travel > 0 ? drag.start + (point.x - drag.x) / drag.travel : 0;
      const snap = tools.snapCreditsPosition(raw, drag.travel, studio.metrics.width * 0.02);
      setCreditsX(Math.round(snap.position * 1000) / 1000);
      return;
    }
    const over = photoUnder(point);
    if (over !== drag.over) setDrag({ ...drag, over, moved: true });
  };
  const onPointerEnd = (event: PointerEvent<HTMLCanvasElement>) => {
    const current = drag;
    setDrag(null);
    if (current?.kind !== "photo" || event.type !== "pointerup") return;
    setPicked(current.id);
    if (current.moved && current.over && current.over !== current.id) studio.movePhoto(current.id, photos.findIndex((photo) => photo.photoId === current.over));
  };

  // -------------------------------------------------------------- layout --
  const [custom, setCustom] = useState({ width: 3, height: 4 });
  const frames = useMemo<Frame[]>(
    () => [
      { key: "adaptive", label: ts("ratioAdaptive"), width: 4, height: 5, adaptive: true },
      ...(tools?.SHARING_POSTER_RATIO_PRESETS ?? []).map((preset) => ({ key: preset.label, label: preset.label, width: preset.width, height: preset.height })),
      { key: "custom", label: t("creatorCustomRatio"), width: custom.width, height: custom.height, custom: true }
    ],
    [tools, ts, t, custom]
  );
  const current = useMemo(() => {
    if (!composition || composition.ratio.adaptive) return 0;
    const index = frames.findIndex((frame) => !frame.adaptive && !frame.custom && frame.width === composition.ratio.width && frame.height === composition.ratio.height);
    return index >= 0 ? index : frames.length - 1;
  }, [composition, frames]);
  // A custom ratio starts from the poster's own.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !composition) return;
    seeded.current = true;
    if (current === frames.length - 1) setCustom({ width: composition.ratio.width, height: composition.ratio.height });
  }, [composition, current, frames.length]);
  const applyFrame = (frame: Frame) => {
    if (!composition || !tools) return;
    if (frame.adaptive) {
      const ratio = tools.adaptivePosterRatio(photos, composition.style, studio.metrics?.wrappedLineCount ?? 0);
      update((value) => ({ ...value, ratio: ratio ? { ...ratio, adaptive: true } : { width: value.ratio.width, height: value.ratio.height, adaptive: true } }));
      if ((composition.style.fit ?? "fill") !== "collage") studio.setFit("collage");
    } else update((value) => ({ ...value, ratio: { width: frame.width, height: frame.height } }));
  };
  const setCustomSide = (side: "width" | "height", value: number) => {
    const next = { ...custom, [side]: Math.min(100, Math.max(1, value || 1)) };
    setCustom(next);
    update((composition) => ({ ...composition, ratio: next }));
  };

  // ------------------------------------------------------------ printing --
  const [printState, setPrintState] = useState<"idle" | "printing" | "error">("idle");
  const [printed, setPrinted] = useState<{ file: File; signature: string } | null>(null);
  const [notice, setNotice] = useState("");
  const signature = composition ? JSON.stringify({ name, composition }) : "";
  // A change after printing needs a new print before it can be shared.
  useEffect(() => {
    if (printed && printed.signature !== signature) setPrinted(null);
  }, [printed, signature]);
  const format = composition?.export.format === "png" ? "png" : "jpeg";
  const edge = composition?.export.longestEdge ?? 2160;
  const unresolved = photos.filter((photo) => !photo.source).length;
  const blocked = !composition || photos.length === 0 ? ts("selectPhotoFirst") : unresolved ? ts("unresolvedError", { count: unresolved }) : studio.metrics?.footerTooTall ? ts("footerTooTall") : "";
  const print = async () => {
    if (!composition || !tools || blocked || printState === "printing") return;
    setPrintState("printing");
    setNotice("");
    try {
      const blob = await printPoster(null, () => tools.exportSharingPoster(composition, photos));
      const filename = `${safeFilename(name, "sharing-poster")}.${format === "png" ? "png" : "jpg"}`;
      download(blob, filename);
      setPrinted({ file: new File([blob], filename, { type: blob.type }), signature });
      setPrintState("idle");
    } catch {
      setPrintState("error");
    }
  };
  const share = async () => {
    if (!printed || !canShareFile(printed.file)) return;
    if (!(await shareFile(printed.file, name))) setNotice(ts("shareError"));
  };

  // -------------------------------------------------------------- render --
  const back = (
    <PhoneBack label={t("back")} onClick={() => go(project ? { kind: "studio", username: project.username, page: "posters" } : { kind: "title" })} />
  );

  if (status !== "ready" || !composition || !tools) {
    return (
      <PhoneShell rootRef={rootRef}>
        <header className="flex items-center border-b border-border-strong px-1 pt-[env(safe-area-inset-top)]">{back}</header>
        <div className="flex flex-1 flex-col items-start justify-center gap-4 px-6">
          <h1 className="text-[2rem] font-extrabold uppercase leading-[0.95] tracking-[-0.04em]">{t("creatorReading")}</h1>
        </div>
      </PhoneShell>
    );
  }

  const style = composition.style;
  const setStyle = (patch: Partial<SharingPosterComposition["style"]>) => update((value) => ({ ...value, style: { ...value.style, ...patch } }));
  const fit = style.fit ?? "fill";
  const toggle = (next: Mode) => setMode(mode === next ? "board" : next);
  const full = photos.length >= max;
  const addPhotos = () => (project ? toggle("add") : !full && !studio.reading && inputRef.current?.click());
  const removeSelected = () => {
    if (!selected) return;
    studio.removePhoto(selected.photoId);
    setPicked(photos[at + 1]?.photoId ?? photos[at - 1]?.photoId ?? null);
    if (mode === "arrange") setMode("board");
  };

  const toolbar: PhoneTool[] = [
    { key: "add", label: t("creatorPhoneAdd"), icon: project ? "photos" : "upload", active: project ? mode === "add" : undefined, disabled: !project && (full || !!studio.reading), run: addPhotos },
    { key: "arrange", label: t("creatorArrange"), icon: "arrange", active: mode === "arrange", disabled: !selected, run: () => toggle("arrange") },
    { key: "layout", label: t("creatorLayout"), icon: "layout", active: mode === "layout", run: () => toggle("layout") },
    { key: "style", label: t("creatorStyle"), icon: "style", active: mode === "style", run: () => toggle("style") },
    { key: "credits", label: t("creatorCredits"), icon: "credits", active: mode === "credits", run: () => toggle("credits") },
    { key: "delete", label: tc("delete"), icon: "delete", disabled: !selected, run: removeSelected }
  ];
  const sheetTitle = { board: "", add: ts("localAddButton"), arrange: t("creatorArrange"), layout: t("creatorLayout"), style: t("creatorStyle"), credits: t("creatorCredits"), print: t("creatorPrint") }[mode];
  const photoLabel = selected ? `${t("creatorPhoto")} ${pad(at + 1)} / ${pad(photos.length)}` : undefined;
  const sizeLabel = selected
    ? composition.sizeRank
      ? ts("photoSizesRankOf", { rank: composition.sizeRank.indexOf(selected.photoId) + 1, count: composition.sizeRank.length })
      : `${ts("visualWeight")} ${Math.round(selected.composition.weight)} / 5`
    : "";
  const savedLabel =
    studio.saved === "conflict"
      ? ts("saveConflict")
      : !name.trim()
        ? ts("projectNameRequired")
        : studio.saved === "saved"
          ? t("creatorPhoneSaved")
          : studio.saved === "error"
            ? ts("saveError")
            : t("creatorSharepostCount", { photos: photos.length });
  const messages = [
    studio.reading && ts("localReading", studio.reading),
    studio.readNotice.failed > 0 && ts("localReadError", { count: studio.readNotice.failed }),
    studio.readNotice.skipped > 0 && ts("localSkipped", { count: studio.readNotice.skipped })
  ].filter(Boolean);

  return (
    <PhoneShell rootRef={rootRef}>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.currentTarget.value = "";
          void studio.addFiles(files);
        }}
      />
      <header className="flex shrink-0 items-center gap-1 border-b border-border-strong px-1 pt-[env(safe-area-inset-top)]">
        {back}
        <div className="min-w-0 flex-1 px-1 text-center">
          <h1 className="font-meta truncate text-[0.6875rem] uppercase tracking-[0.12em]">{name || t("menuPoster")}</h1>
          <p role="status" className={`font-meta truncate text-[0.625rem] ${studio.saved === "conflict" || !name.trim() ? "text-danger" : "text-fg-subtle"}`}>
            {savedLabel}
          </p>
        </div>
        <button
          type="button"
          aria-pressed={mode === "print"}
          disabled={photos.length === 0}
          onClick={() => toggle("print")}
          className={`ml-1 inline-flex min-h-9 shrink-0 items-center px-3 text-xs font-semibold uppercase tracking-[0.08em] disabled:opacity-30 ${mode === "print" ? "border border-fg text-fg" : "bg-fg text-page"}`}
        >
          {t("creatorPrint")}
        </button>
      </header>

      {studio.saved === "conflict" && (
        <p role="alert" className="shrink-0 border-b border-border-strong px-3 py-2 text-sm text-danger">
          {ts("conflictHint")}{" "}
          <button type="button" onClick={() => window.location.reload()} className="underline underline-offset-4">
            {ts("reload")}
          </button>
        </p>
      )}

      <div ref={frameRef} className="relative grid min-h-0 flex-1 place-items-center bg-fg/[0.04]">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={t("menuPoster")}
          className="block touch-none select-none shadow-[0_6px_24px_rgba(0,0,0,0.18)]"
          style={{ width: size.width, height: size.height }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onClick={() => empty && addPhotos()}
        />
      </div>

      {mode === "board" ? (
        <div className="shrink-0 border-t border-border-strong">
          <div role="group" aria-label={t("creatorPhonePhotos")} className="flex gap-1.5 overflow-x-auto px-2 py-2 [scrollbar-width:none]">
            {photos.map((photo, index) => {
              const active = photo.photoId === selected?.photoId;
              return (
                <button
                  key={photo.photoId}
                  type="button"
                  aria-pressed={active}
                  aria-label={`${t("creatorPhoto")} ${pad(index + 1)} / ${pad(photos.length)}`}
                  onClick={() => setPicked(photo.photoId)}
                  className={`relative h-14 w-14 shrink-0 overflow-hidden border-2 ${active ? "border-accent" : "border-transparent"}`}
                >
                  {photo.source ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo.source.thumbUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="grid h-full w-full place-items-center bg-fg/[0.08] text-lg text-fg-subtle">?</span>
                  )}
                  <span className={`font-meta absolute bottom-0 left-0 px-1 text-[0.625rem] font-semibold ${active ? "bg-accent text-accent-fg" : "bg-page/85 text-fg"}`}>{pad(index + 1)}</span>
                </button>
              );
            })}
            {!full && (
              <button
                type="button"
                onClick={addPhotos}
                disabled={!!studio.reading}
                className={`flex h-14 shrink-0 items-center justify-center gap-1 border border-dashed border-accent px-3 text-sm font-semibold text-accent-text disabled:opacity-40 ${photos.length ? "w-14" : "flex-1"}`}
              >
                <span aria-hidden="true" className="text-xl leading-none">+</span>
                <span className={photos.length ? "sr-only" : undefined}>{ts("localAddButton")}</span>
              </button>
            )}
          </div>
          <p className="px-3 pb-1.5 text-[0.6875rem] leading-4 text-fg-muted">
            {photos.length ? t("creatorSharepostPhoneHint") : project ? `${photos.length} / ${max}` : t("creatorPhotosEmptyHint")}
            {full && <span className="block">{ts("localFull")}</span>}
          </p>
        </div>
      ) : (
        <PhoneSheet
          title={sheetTitle}
          aside={mode === "arrange" ? photoLabel : mode === "add" ? `${photos.length} / ${max}` : undefined}
          doneLabel={t("creatorPhoneDone")}
          onDone={() => setMode("board")}
          tall={mode === "add" || typing}
        >
          {mode === "add" && (
            <Suspense fallback={null}>
              <SharepostGallery />
            </Suspense>
          )}

          {mode === "arrange" && selected && (
            <div className="grid gap-3 pt-1">
              <div className="grid grid-cols-2 gap-2">
                <button type="button" disabled={at <= 0} onClick={() => studio.movePhoto(selected.photoId, at - 1)} className={`${secondaryClass} justify-center disabled:opacity-30`}>
                  <span aria-hidden="true">←</span> {t("creatorMoveEarlier")}
                </button>
                <button type="button" disabled={at >= photos.length - 1} onClick={() => studio.movePhoto(selected.photoId, at + 1)} className={`${secondaryClass} justify-center disabled:opacity-30`}>
                  {t("creatorMoveLater")} <span aria-hidden="true">→</span>
                </button>
              </div>
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 text-sm font-semibold text-fg-muted">
                  {t("creatorPhotoSize")}
                  <span className="block text-xs font-normal text-fg-subtle">{sizeLabel}</span>
                </p>
                <button type="button" className={`${secondaryClass} min-w-12 justify-center text-lg`} aria-label={ts("rankSmaller")} onClick={() => studio.resizePhoto(selected.photoId, -1)}>−</button>
                <button type="button" className={`${secondaryClass} min-w-12 justify-center text-lg`} aria-label={ts("rankLarger")} onClick={() => studio.resizePhoto(selected.photoId, 1)}>+</button>
              </div>
              <p className="text-xs text-fg-subtle">{t("creatorSharepostPhoneHint")}</p>
            </div>
          )}

          {mode === "layout" && (
            <div className="grid gap-4 pt-1">
              <div role="group" aria-label={t("creatorLayout")} className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none]">
                {frames.map((frame, index) => {
                  const active = index === current;
                  const scale = 28 / Math.max(frame.width, frame.height);
                  return (
                    <button
                      key={frame.key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => applyFrame(frame)}
                      className={`flex min-h-[4.5rem] w-[4.75rem] shrink-0 flex-col items-center justify-center gap-1 border px-1 ${active ? "border-fg bg-fg text-page" : "border-border-strong"}`}
                    >
                      <span
                        aria-hidden="true"
                        className={`block border-2 ${frame.adaptive || frame.custom ? "border-dashed" : ""} ${active ? "border-page" : "border-fg"}`}
                        style={{ width: frame.width * scale, height: frame.height * scale }}
                      />
                      <span className="w-full truncate text-center text-[0.6875rem] font-semibold leading-tight">{frame.label}</span>
                      {frame.label !== `${frame.width}:${frame.height}` && (
                        <span className={`font-meta w-full truncate text-center text-[0.5625rem] ${active ? "text-page/75" : "text-fg-subtle"}`}>{frame.adaptive ? t("creatorAdaptiveSub") : `${frame.width}:${frame.height}`}</span>
                      )}
                    </button>
                  );
                })}
              </div>
              {current === 0 && (
                <p className="text-xs text-fg-subtle">
                  {ts("ratioAdaptiveHint", { ratio: composition.ratio.width >= composition.ratio.height ? `${(composition.ratio.width / composition.ratio.height).toFixed(2)}:1` : `1:${(composition.ratio.height / composition.ratio.width).toFixed(2)}` })}
                </p>
              )}
              {current === frames.length - 1 && (
                <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                  <label className="grid gap-1 text-sm font-semibold text-fg-muted">
                    {ts("ratioWidth")}
                    <input type="number" inputMode="numeric" min="1" max="100" value={custom.width} onChange={(event) => setCustomSide("width", Number(event.target.value))} className={fieldClass} />
                  </label>
                  <button
                    type="button"
                    aria-label={ts("swapOrientation")}
                    className={secondaryClass}
                    onClick={() => {
                      const next = { width: custom.height, height: custom.width };
                      setCustom(next);
                      update((value) => ({ ...value, ratio: next }));
                    }}
                  >
                    ↔
                  </button>
                  <label className="grid gap-1 text-sm font-semibold text-fg-muted">
                    {ts("ratioHeight")}
                    <input type="number" inputMode="numeric" min="1" max="100" value={custom.height} onChange={(event) => setCustomSide("height", Number(event.target.value))} className={fieldClass} />
                  </label>
                </div>
              )}
              <div className="grid gap-2">
                <span className="text-sm font-semibold text-fg-muted">{ts("photoFit")}</span>
                <div role="group" aria-label={ts("photoFit")} className="grid grid-cols-3 gap-2">
                  {(["collage", "whole", "fill"] as const).map((value) => (
                    <button key={value} type="button" aria-pressed={fit === value} onClick={() => studio.setFit(value)} className={`${secondaryClass} justify-center px-2 text-xs ${pressed(fit === value)}`}>
                      {ts(value === "collage" ? "photoFitCollage" : value === "whole" ? "photoFitWhole" : "photoFitFill")}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {mode === "style" && (
            <div className="grid gap-4 pt-1">
              <RangeField label={ts("outerMargin")} value={style.marginPercent} min={0} max={12} step={0.25} suffix="%" onChange={(value) => setStyle({ marginPercent: value })} />
              <RangeField label={ts("photoGap")} value={style.gapPercent} min={0} max={5} step={0.1} suffix="%" onChange={(value) => setStyle({ gapPercent: value })} />
              <RangeField label={ts("featherEdges")} value={style.featherPercent ?? 0} min={0} max={25} step={0.5} suffix="%" onChange={(value) => setStyle({ featherPercent: value })} />
              <RangeField
                label={ts("dropShadow")}
                value={Math.round((style.shadow?.opacity ?? 0) * 100)}
                min={0}
                max={100}
                step={5}
                suffix="%"
                onChange={(value) => setStyle({ shadow: value > 0 ? { ...tools.SHARING_POSTER_SHADOW_DEFAULTS, ...style.shadow, opacity: value / 100 } : undefined })}
              />
              {style.shadow && (
                <>
                  <RangeField label={ts("dropShadowBlur")} value={style.shadow.blurPercent} min={0} max={5} step={0.1} suffix="%" onChange={(value) => style.shadow && setStyle({ shadow: { ...style.shadow, blurPercent: value } })} />
                  <RangeField label={ts("dropShadowOffset")} value={style.shadow.offsetPercent} min={0} max={3} step={0.1} suffix="%" onChange={(value) => style.shadow && setStyle({ shadow: { ...style.shadow, offsetPercent: value } })} />
                </>
              )}
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1 text-sm font-semibold text-fg-muted">
                  {ts("backgroundColor")}
                  <input type="color" value={style.backgroundColor} onChange={(event) => setStyle({ backgroundColor: event.target.value })} className="h-11 w-full border border-border-strong bg-page/80 p-1" />
                </label>
                <label className="grid gap-1 text-sm font-semibold text-fg-muted">
                  {ts("textColor")}
                  <input type="color" value={style.textColor} onChange={(event) => setStyle({ textColor: event.target.value })} className="h-11 w-full border border-border-strong bg-page/80 p-1" />
                </label>
              </div>
              <div role="group" aria-label={ts("backgroundMode")} className="grid grid-cols-2 gap-2">
                {(["solid", "glass"] as const).map((value) => {
                  const active = (style.background?.mode ?? "solid") === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setStyle({ background: value === "glass" ? (style.background?.mode === "glass" ? style.background : { mode: "glass", ...tools.SHARING_POSTER_GLASS_DEFAULTS }) : { mode: "solid" } })}
                      className={`${secondaryClass} justify-center text-xs ${pressed(active)}`}
                    >
                      {ts(value === "glass" ? "backgroundGlass" : "backgroundSolid")}
                    </button>
                  );
                })}
              </div>
              {style.background?.mode === "glass" && (
                <>
                  <RangeField label={ts("glassBlur")} value={style.background.blurPercent} min={0.5} max={8} step={0.1} suffix="%" onChange={(value) => style.background?.mode === "glass" && setStyle({ background: { ...style.background, blurPercent: value } })} />
                  <RangeField label={ts("glassTint")} value={Math.round(style.background.tintOpacity * 100)} min={0} max={90} step={5} suffix="%" onChange={(value) => style.background?.mode === "glass" && setStyle({ background: { ...style.background, tintOpacity: value / 100 } })} />
                  <RangeField label={ts("glassLocal")} value={Math.round((style.background.local ?? 0) * 100)} min={0} max={100} step={5} suffix="%" onChange={(value) => style.background?.mode === "glass" && setStyle({ background: { ...style.background, local: value / 100 } })} />
                </>
              )}
            </div>
          )}

          {mode === "credits" && (
            <div className="grid gap-4 pt-1">
              <SharingPosterCreditLayers
                lines={composition.credits.lines}
                defaultLabels={tools.sharingPosterCreditLabels(composition.outputLocale)}
                cnWarning={null}
                onConfirmCn={() => undefined}
                onAdd={studio.addCreditLine}
                onMove={(id, index) => studio.updateCreditLines((lines) => tools.moveSharingPosterCreditLine(lines, id, index))}
                onValueChange={studio.setCreditValue}
                onLabelChange={(id, value) =>
                  studio.updateCreditLines((lines) =>
                    lines.map((line) => {
                      if (line.id !== id) return line;
                      const next = { ...line };
                      if (value === undefined) delete next.label;
                      else next.label = value;
                      return next;
                    })
                  )
                }
                onRemove={(id) => studio.updateCreditLines((lines) => lines.filter((line) => line.id !== id))}
              />
              <div className="grid gap-2 border-t border-border-strong pt-3">
                <span className="text-sm font-semibold text-fg-muted">{ts("creditsPosition")}</span>
                <div role="group" aria-label={ts("creditsPosition")} className="grid grid-cols-3 gap-2">
                  {([[0, "creditsLeft"], [0.5, "creditsCenter"], [1, "creditsRight"]] as const).map(([x, label]) => (
                    <button key={label} type="button" aria-pressed={creditsX === x} onClick={() => setCreditsX(x)} className={`${secondaryClass} justify-center ${pressed(creditsX === x)}`}>
                      {ts(label)}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-fg-subtle">{t("creatorCreditsDragTouch")}</p>
              </div>
              <RangeField label={ts("footerTextSize")} value={style.footerTextPercent} min={1} max={4} step={0.1} suffix="%" onChange={(value) => setStyle({ footerTextPercent: value })} />
              <RangeField
                label={ts("textGap")}
                value={style.textGapPercent ?? Math.min(8, Math.round(tools.legacyTextGapPercent(style) * 10) / 10)}
                min={0}
                max={8}
                step={0.1}
                suffix="%"
                onChange={(value) => setStyle({ textGapPercent: value })}
              />
              {studio.metrics?.footerTooTall && <p role="alert" className="text-sm text-warning">{ts("footerTooTall")}</p>}
            </div>
          )}

          {mode === "print" && (
            <div className="grid gap-3 pt-1">
              <label className="grid gap-1 text-sm font-semibold text-fg-muted">
                {ts("projectName")}
                <input value={name} required maxLength={120} aria-invalid={!name.trim()} onChange={(event) => studio.setName(event.target.value)} className={fieldClass} />
              </label>
              <div className="grid gap-2">
                <span className="text-sm font-semibold text-fg-muted">{ts("format")}</span>
                <div role="group" aria-label={ts("format")} className="grid grid-cols-2 gap-2">
                  {(["jpeg", "png"] as const).map((value) => (
                    <button key={value} type="button" aria-pressed={format === value} onClick={() => update((current) => ({ ...current, export: { ...current.export, format: value } }))} className={`${secondaryClass} justify-center text-xs ${pressed(format === value)}`}>
                      {value === "png" ? "PNG" : "JPEG · 92%"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-2">
                <span className="text-sm font-semibold text-fg-muted">{ts("longestEdge")}</span>
                <div role="group" aria-label={ts("longestEdge")} className="grid grid-cols-3 gap-2">
                  {EDGES.map((value) => (
                    <button key={value} type="button" aria-pressed={edge === value} onClick={() => update((current) => ({ ...current, export: { ...current.export, longestEdge: value } }))} className={`${secondaryClass} justify-center text-xs ${pressed(edge === value)}`}>
                      {value} PX
                    </button>
                  ))}
                </div>
                {edge > 4096 && <p className="text-xs text-fg-subtle">{ts("largeExportHint")}</p>}
              </div>
              {blocked && <p role="alert" className="text-sm text-warning">{blocked}</p>}
              <button
                type="button"
                disabled={!!blocked || printState === "printing"}
                onClick={() => void print()}
                className="inline-flex min-h-12 w-full items-center justify-between gap-4 bg-fg px-4 text-sm font-semibold uppercase tracking-[0.08em] text-page disabled:opacity-40"
              >
                {t(printState === "printing" ? "creatorPrinting" : "creatorDownloadFormat", { format: format.toUpperCase() })}
                {pixels && <span className="font-meta text-[0.625rem] text-page/75">{pixels.width} × {pixels.height} PX</span>}
              </button>
              {printed && canShareFile(printed.file) && (
                <button type="button" onClick={() => void share()} className={`${secondaryClass} w-full justify-center`}>
                  {ts("share")}
                </button>
              )}
              <p aria-live="polite" className="min-h-5 text-sm">
                {printState === "error" && <span className="text-danger">{t("creatorPrintFailed")}</span>}
                {notice && <span className="text-danger">{notice}</span>}
                {printed && printState === "idle" && !notice && <span className="text-fg-muted">{ts("exportReady")}</span>}
              </p>
            </div>
          )}
        </PhoneSheet>
      )}

      {messages.length > 0 && (
        <p role="status" className="shrink-0 border-t border-border-strong px-3 py-2 text-sm text-fg-muted">
          {messages.map((message) => (
            <span key={String(message)} className="block">{message}</span>
          ))}
        </p>
      )}

      <PhoneToolbar label={t("creatorPhoneTools")} tools={toolbar} hidden={typing} />
    </PhoneShell>
  );
}
