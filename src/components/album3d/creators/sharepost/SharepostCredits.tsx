"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import RangeField from "@/components/sharing-posters/PosterRangeField";
import SharingPosterCreditLayers from "@/components/sharing-posters/SharingPosterCreditLayers";
import { Hints } from "../../hud";
import styles from "../../ArchiveSite.module.css";
import { BookingPanel, metaLabel, secondaryClass, useScene, useScreenKeys, useStage, useStageDrag } from "../../booking/shared";
import { paintBlankPoster } from "../shared";
import { matPoint, useMatPaint } from "./mat";
import { SaveState } from "./SharepostPhotos";
import { useSharepostStudio } from "./SharepostStudio";

const POSITIONS = [0, 0.5, 1] as const;

/**
 * Create Sharepost, credits: the lines printed under the photographs, typed
 * in the panel (the classic editor's credit layers), and the block dragged
 * along the poster, snapping to the photographs' edges and centre.
 */
export default function SharepostCredits() {
  const t = useTranslations("album3d");
  const ts = useTranslations("sharingPosters");
  const { key, touch } = useStage();
  const scene = useScene("poster");
  const studio = useSharepostStudio();
  const { composition, tools, status, update } = studio;
  const [typing, setTyping] = useState(false);
  useMatPaint(scene, studio, { blank: (canvas) => paintBlankPoster(canvas, t("creatorAddPhotosBlank")) });

  const setCreditsX = (x: number) => update((value) => (value.style.creditsX === x ? value : { ...value, style: { ...value.style, creditsX: x } }));
  const position = composition?.style.creditsX ?? 0;
  const step = (delta: number) => {
    const index = POSITIONS.findIndex((value) => value >= position - 0.001);
    setCreditsX(POSITIONS[Math.max(0, Math.min(2, (index < 0 ? 2 : index) + delta))]);
  };

  useScreenKeys((k) => {
    if (!composition) return false;
    if (k === "ArrowLeft" || k === "ArrowRight") step(k === "ArrowLeft" ? -1 : 1);
    else return false;
    return true;
  });

  // Drag the credits block along the poster.
  const drag = useRef<{ x: number; start: number; travel: number } | null>(null);
  useStageDrag((input) => {
    if (input.phase === "wheel" || !scene || !studio.metrics || !tools) return false;
    if (input.phase === "down") {
      const text = studio.metrics.text;
      const at = matPoint(scene, studio.metrics, input.clientX, input.clientY, input.rect);
      if (!text || !at || at.x < text.x || at.x > text.x + text.width || at.y < text.y - text.height * 0.2 || at.y > text.y + text.height * 1.2) return false;
      drag.current = { x: at.x, start: position, travel: text.travel };
      return true;
    }
    const current = drag.current;
    if (!current) return true;
    if (input.phase === "move") {
      const at = matPoint(scene, studio.metrics, input.clientX, input.clientY, input.rect, true);
      if (!at) return true;
      const raw = current.travel > 0 ? current.start + (at.x - current.x) / current.travel : 0;
      const snap = tools.snapCreditsPosition(raw, current.travel, studio.metrics.width * 0.02);
      setCreditsX(Math.round(snap.position * 1000) / 1000);
      return true;
    }
    drag.current = null;
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
  return (
    <>
      <BookingPanel expanded={typing}>
        <div
          onFocus={(event) => setTyping(event.target instanceof HTMLInputElement && event.target.type === "text")}
          onBlur={(event) => !(event.relatedTarget instanceof HTMLInputElement && event.relatedTarget.type === "text") && setTyping(false)}
        >
          <p className={metaLabel}>
            {t("creatorCredits")}
            <span aria-hidden="true" className="mx-2">／</span>
            {composition.credits.lines.length} / {tools.SHARING_POSTER_MAX_CREDIT_LINES}
          </p>
          <h1 className="mt-3 text-[2.25rem] font-extrabold uppercase leading-[0.95] tracking-[-0.04em] wide:text-[3.25rem]">{ts("creditsTitle")}</h1>
          <div aria-hidden="true" className={styles.calloutRule} />
          <p className="mt-6 max-w-md text-sm text-fg-muted">{ts("localCreditsHint")}</p>
          <div className="mt-4">
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
          </div>
          <section aria-label={ts("creditsPosition")} className="mt-6 grid gap-3 border-t border-border-strong pt-4">
            <span className="text-sm font-semibold text-fg-muted">{ts("creditsPosition")}</span>
            <div role="group" aria-label={ts("creditsPosition")} className="grid grid-cols-3 gap-2">
              {([[0, "creditsLeft"], [0.5, "creditsCenter"], [1, "creditsRight"]] as const).map(([x, label]) => (
                <button key={label} type="button" aria-pressed={position === x} onClick={() => setCreditsX(x)} className={`${secondaryClass} justify-center ${position === x ? "border-fg bg-fg/[0.08]" : ""}`}>
                  {ts(label)}
                </button>
              ))}
            </div>
            <p className="text-xs text-fg-subtle">{t(touch ? "creatorCreditsDragTouch" : "creatorCreditsDrag")}</p>
            <RangeField label={ts("footerTextSize")} value={style.footerTextPercent} min={1} max={4} step={0.1} suffix="%" onChange={(value) => update((current) => ({ ...current, style: { ...current.style, footerTextPercent: value } }))} />
            <RangeField
              label={ts("textGap")}
              value={style.textGapPercent ?? Math.min(8, Math.round(tools.legacyTextGapPercent(style) * 10) / 10)}
              min={0}
              max={8}
              step={0.1}
              suffix="%"
              onChange={(value) => update((current) => ({ ...current, style: { ...current.style, textGapPercent: value } }))}
            />
            {studio.metrics?.footerTooTall && <p role="alert" className="text-sm text-warning">{ts("footerTooTall")}</p>}
          </section>
          <SaveState />
        </div>
      </BookingPanel>
      {!touch && <Hints className={styles.menuHint} parts={[`${key("sides")} ${t("creatorHintAlign")}`, `${key("back")} ${t("hintBack")}`]} />}
    </>
  );
}
