"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { SharingPosterComposition } from "@/lib/sharingPoster";
import RangeField from "@/components/sharing-posters/PosterRangeField";
import { GameMenu, Hints, pad, type MenuItem } from "../../hud";
import styles from "../../ArchiveSite.module.css";
import { BookingPanel, fieldClass, isInteractive, metaLabel, secondaryClass, useScene, useScreenKeys, useStage, useStageDrag, useStageInput } from "../../booking/shared";
import { RAIL_PICK } from "../../types";
import { paintBlankPoster } from "../shared";
import { photoAt, useMatPaint } from "./mat";
import { SaveState } from "./SharepostPhotos";
import { useSharepostStudio } from "./SharepostStudio";

type Frame = { key: string; label: string; width: number; height: number; adaptive?: boolean; custom?: boolean };

/** A frame of the ratio's shape, for its card on the rack. */
function frameCard(frame: Frame): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 240;
  canvas.height = 220;
  const c = canvas.getContext("2d");
  if (!c) return canvas;
  c.fillStyle = "#ece6dc";
  c.fillRect(0, 0, 240, 220);
  const scale = Math.min(170 / frame.width, 170 / frame.height);
  const w = frame.width * scale;
  const h = frame.height * scale;
  c.fillStyle = "#fbf8f3";
  c.fillRect(120 - w / 2, 110 - h / 2, w, h);
  c.strokeStyle = "#1c1a16";
  c.lineWidth = 4;
  if (frame.adaptive || frame.custom) c.setLineDash([10, 7]);
  c.strokeRect(120 - w / 2, 110 - h / 2, w, h);
  return canvas;
}

/**
 * Create Sharepost, layout: the poster's shapes stand as frames on a rack
 * in front of the easel (←/→ turns it, and the easel tries the focused one
 * on), the style is set in the panel, and ↑/↓ makes the picked photograph
 * larger or smaller.
 */
export default function SharepostLayout() {
  const t = useTranslations("album3d");
  const ts = useTranslations("sharingPosters");
  const { key, touch } = useStage();
  const scene = useScene("poster");
  const studio = useSharepostStudio();
  const { composition, photos, tools, status, update } = studio;
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
    if (!composition) return 0;
    if (composition.ratio.adaptive) return 0;
    const index = frames.findIndex((frame) => !frame.adaptive && !frame.custom && frame.width === composition.ratio.width && frame.height === composition.ratio.height);
    return index >= 0 ? index : frames.length - 1;
  }, [composition, frames]);
  const [focus, setFocus] = useState<number | null>(null);
  const at = focus ?? current;
  const frame = frames[at];
  // A custom ratio starts from the poster's own.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !composition) return;
    seeded.current = true;
    if (current === frames.length - 1) setCustom({ width: composition.ratio.width, height: composition.ratio.height });
  }, [composition, current, frames.length]);

  const ratioOf = (target: Frame): SharingPosterComposition["ratio"] | null => {
    if (!composition || !tools) return null;
    if (target.adaptive) {
      const ratio = tools.adaptivePosterRatio(photos, composition.style, studio.metrics?.wrappedLineCount ?? 0);
      return ratio ? { ...ratio, adaptive: true } : { width: composition.ratio.width, height: composition.ratio.height, adaptive: true };
    }
    return { width: target.width, height: target.height };
  };
  const applied = composition && frame && at === current && (!frame.custom || (composition.ratio.width === custom.width && composition.ratio.height === custom.height));
  const preview = useMemo(() => {
    if (!composition || !frame || applied) return null;
    const ratio = ratioOf(frame);
    return ratio ? { ...composition, ratio, ...(frame.adaptive ? { style: { ...composition.style, fit: "collage" as const } } : {}) } : null;
    // ratioOf reads the same inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composition, frame, applied, photos, tools, studio.metrics?.wrappedLineCount]);

  const apply = (target: Frame) => {
    const ratio = ratioOf(target);
    if (!ratio) return;
    update((value) => ({ ...value, ratio }));
    if (target.adaptive && composition && (composition.style.fit ?? "fill") !== "collage") studio.setFit("collage");
    setFocus(null);
  };

  // The photograph ↑/↓ resizes: tapped on the poster, or the first.
  const [picked, setPicked] = useState<string | null>(null);
  const selected = photos.find((photo) => photo.photoId === picked) ?? photos[0] ?? null;
  const selectedIndex = selected ? photos.indexOf(selected) : -1;
  const sizeLabel = selected
    ? composition?.sizeRank
      ? ts("photoSizesRankOf", { rank: composition.sizeRank.indexOf(selected.photoId) + 1, count: composition.sizeRank.length })
      : `${ts("visualWeight")} ${Math.round(selected.composition.weight)} / 5`
    : "";

  useMatPaint(scene, studio, { selected: selected?.photoId, composition: preview, key: "sharepost", blank: (canvas) => paintBlankPoster(canvas, t("creatorAddPhotosBlank")) });

  // The cards are drawn on canvases, so only in the browser (this page also renders on the server).
  const cards = useMemo(
    () => (scene ? frames.map((item) => ({ key: item.key, image: frameCard(item), label: item.label, sub: item.adaptive ? t("creatorAdaptiveSub") : `${item.width}:${item.height}` })) : []),
    [scene, frames, t]
  );
  useEffect(() => {
    scene?.setRail(composition ? cards : null, at);
  }, [scene, cards, at, composition]);
  useEffect(() => () => scene?.setRail(null, 0), [scene]);

  const turn = (delta: number) => setFocus(Math.max(0, Math.min(frames.length - 1, at + delta)));
  useScreenKeys((k, target) => {
    if (!composition) return false;
    if (k === "ArrowLeft" || k === "ArrowRight") turn(k === "ArrowLeft" ? -1 : 1);
    else if ((k === "ArrowUp" || k === "ArrowDown") && selected) studio.resizePhoto(selected.photoId, k === "ArrowUp" ? 1 : -1);
    else if (k === "Enter" && !isInteractive(target) && frame) apply(frame);
    else return false;
    return true;
  });
  useStageInput((input) => {
    if (input.kind === "swipe" && input.x) turn(input.x);
    else if (input.kind === "wheel") turn(input.direction);
    else if (input.kind === "pick" && input.index >= RAIL_PICK) {
      const index = input.index - RAIL_PICK;
      if (index === at) apply(frames[index]);
      else setFocus(index);
    }
  });
  // A tap on a photograph picks it for resizing.
  useStageDrag((input) => {
    if (input.phase === "wheel") return false;
    if (input.phase !== "down") return true;
    if (!scene || !studio.metrics || preview) return false;
    const id = photoAt(scene, studio.metrics, input.clientX, input.clientY, input.rect);
    if (!id) return false;
    setPicked(id);
    return true;
  });

  if (status !== "ready" || !composition || !tools) {
    return (
      <BookingPanel>
        <p className={metaLabel}>{t("menuPoster")}</p>
        <h1 className="mt-3 text-[2.5rem] font-extrabold uppercase leading-[0.95] tracking-[-0.04em]">{t("creatorReading")}</h1>
      </BookingPanel>
    );
  }

  const style = composition.style;
  const setStyle = (patch: Partial<SharingPosterComposition["style"]>) => update((value) => ({ ...value, style: { ...value.style, ...patch } }));
  const fit = style.fit ?? "fill";
  const size = tools.sharingPosterPixelSize(preview ?? composition);
  const items: MenuItem[] = frame
    ? [{ key: "use", label: applied ? t("creatorRatioInUse", { ratio: frame.label }) : t("creatorUseRatio", { ratio: frame.label }), sub: `${size.width} × ${size.height} PX`, run: () => apply(frame) }]
    : [];

  return (
    <>
      <BookingPanel>
        <p className={metaLabel}>
          {t("creatorLayout")}
          <span aria-hidden="true" className="mx-2">／</span>
          {pad(at + 1)} / {pad(frames.length)}
        </p>
        <h1 className="mt-3 text-[2.25rem] font-extrabold uppercase leading-[0.95] tracking-[-0.04em] wide:text-[3.25rem]">{frame?.label}</h1>
        <div aria-hidden="true" className={styles.calloutRule} />
        <p className="mt-6 max-w-md text-sm text-fg-muted">
          {frame?.adaptive ? ts("ratioAdaptiveHint", { ratio: composition.ratio.width >= composition.ratio.height ? `${(composition.ratio.width / composition.ratio.height).toFixed(2)}:1` : `1:${(composition.ratio.height / composition.ratio.width).toFixed(2)}` }) : t("creatorLayoutHint")}
        </p>
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => turn(-1)} disabled={at === 0} aria-label={t("creatorPrevious")} className="min-h-11 min-w-11 border border-border-strong text-lg disabled:opacity-30">‹</button>
          <button type="button" onClick={() => turn(1)} disabled={at >= frames.length - 1} aria-label={t("creatorNext")} className="min-h-11 min-w-11 border border-border-strong text-lg disabled:opacity-30">›</button>
        </div>
        {frame?.custom && (
          <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <label className="grid gap-1 text-sm font-semibold text-fg-muted">
              {ts("ratioWidth")}
              <input type="number" min="1" max="100" value={custom.width} onChange={(event) => setCustom((value) => ({ ...value, width: Math.min(100, Math.max(1, Number(event.target.value) || 1)) }))} className={fieldClass} />
            </label>
            <button type="button" aria-label={ts("swapOrientation")} className={secondaryClass} onClick={() => setCustom((value) => ({ width: value.height, height: value.width }))}>↔</button>
            <label className="grid gap-1 text-sm font-semibold text-fg-muted">
              {ts("ratioHeight")}
              <input type="number" min="1" max="100" value={custom.height} onChange={(event) => setCustom((value) => ({ ...value, height: Math.min(100, Math.max(1, Number(event.target.value) || 1)) }))} className={fieldClass} />
            </label>
          </div>
        )}
        <GameMenu label={t("creatorLayout")} className="mt-4" focus={0} onFocus={() => undefined} items={items} />

        {selected && (
          <section aria-label={t("creatorPhotoSize")} className="mt-6 border-t border-border-strong pt-4">
            <p className={metaLabel}>
              {t("creatorPhoto")} {pad(selectedIndex + 1)} / {pad(photos.length)}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <button type="button" className={secondaryClass} aria-label={ts("rankSmaller")} onClick={() => studio.resizePhoto(selected.photoId, -1)}>−</button>
              <button type="button" className={secondaryClass} aria-label={ts("rankLarger")} onClick={() => studio.resizePhoto(selected.photoId, 1)}>+</button>
              <span className="text-sm text-fg-muted">{sizeLabel}</span>
            </div>
            <p className="mt-2 text-xs text-fg-subtle">{t(touch ? "creatorPhotoSizeHintTouch" : "creatorPhotoSizeHint")}</p>
          </section>
        )}

        <section aria-label={ts("photoFit")} className="mt-6 grid gap-4 border-t border-border-strong pt-4">
          <div role="group" aria-label={ts("photoFit")} className="grid grid-cols-3 gap-2">
            {(["collage", "whole", "fill"] as const).map((mode) => (
              <button key={mode} type="button" aria-pressed={fit === mode} onClick={() => studio.setFit(mode)} className={`${secondaryClass} justify-center px-2 text-xs ${fit === mode ? "border-fg bg-fg/[0.08]" : ""}`}>
                {ts(mode === "collage" ? "photoFitCollage" : mode === "whole" ? "photoFitWhole" : "photoFitFill")}
              </button>
            ))}
          </div>
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
            {(["solid", "glass"] as const).map((mode) => {
              const active = (style.background?.mode ?? "solid") === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setStyle({ background: mode === "glass" ? (style.background?.mode === "glass" ? style.background : { mode: "glass", ...tools.SHARING_POSTER_GLASS_DEFAULTS }) : { mode: "solid" } })}
                  className={`${secondaryClass} justify-center text-xs ${active ? "border-fg bg-fg/[0.08]" : ""}`}
                >
                  {ts(mode === "glass" ? "backgroundGlass" : "backgroundSolid")}
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
        </section>
        <SaveState />
      </BookingPanel>
      {!touch && (
        <Hints
          className={styles.menuHint}
          parts={[`${key("sides")} ${t("creatorHintFrames")}`, `${key("move")} ${t("creatorHintSize")}`, `${key("confirm")} ${t("creatorHintApply")}`, `${key("back")} ${t("hintBack")}`]}
        />
      )}
    </>
  );
}
