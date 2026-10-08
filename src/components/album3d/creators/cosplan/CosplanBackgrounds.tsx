"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { composeOnTemplate } from "@/lib/cosplanDraft";
import { renderCosplan } from "@/lib/cosplanCanvas";
import { GameMenu, Hints, pad, wrap, type MenuItem } from "../../hud";
import styles from "../../ArchiveSite.module.css";
import { BookingPanel, isInteractive, metaLabel, useScene, useScreenKeys, useStage, useStageInput } from "../../booking/shared";
import { RAIL_PICK } from "../../types";
import { paintBlankPoster } from "../shared";
import { paintGuides } from "./board";
import { useCosplanStudio } from "./CosplanStudio";

/**
 * Create Cosplan, first screen: a saved draft stands on the easel with
 * Continue, or the published backgrounds stand on a rail in front of it.
 * ←/→ turns the rail and the easel shows the focused background with the
 * draft's characters moved onto it, as choosing it would.
 */
export default function CosplanBackgrounds() {
  const t = useTranslations("album3d");
  const tc = useTranslations("cosplan");
  const locale = useLocale();
  const { key, touch, go } = useStage();
  const scene = useScene("poster");
  const studio = useCosplanStudio();
  const { templates, composition, status } = studio;
  // Choosing a background for a blank poster rather than the draft's.
  const [fresh, setFresh] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [focus, setFocus] = useState(0);
  const [menuFocus, setMenuFocus] = useState(0);
  const rail = railOpen || (status === "ready" && !composition);

  // The rail opens on the draft's own background.
  useEffect(() => {
    if (!composition) return;
    const index = templates.findIndex((template) => template.id === composition.templateId);
    if (index >= 0) setFocus(index);
    // Only when the draft first arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const template = templates[Math.min(focus, templates.length - 1)] ?? null;
  const preview = useMemo(
    () => (rail && template ? composeOnTemplate(template, fresh ? null : composition) : composition),
    [rail, template, fresh, composition]
  );

  useEffect(() => {
    if (!scene || status === "reading") return;
    if (!preview) {
      paintBlankPoster(scene.setPoster("cosplan:none", 0.8), t(templates.length ? "creatorBlank" : "creatorNoBackgrounds"));
      scene.refresh();
      return;
    }
    const canvas = scene.setPoster(`cosplan:${preview.templateId}`, preview.width / preview.height);
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const scale = canvas.width / preview.width;
      renderCosplan(ctx, preview, { ...studio.images, background: studio.image(preview.backgroundUrl), foreground: studio.image(preview.foregroundUrl) }, scale);
      if (rail) paintGuides(ctx, preview, scale, { accent: scene.accent(), locale, focusSlot: null, selected: null, slots: true });
    }
    scene.refresh();
  }, [scene, status, preview, rail, studio, locale, t, templates.length]);

  useEffect(() => {
    if (!scene) return;
    scene.setRail(
      rail ? templates.map((item) => ({ key: item.id, image: studio.image(item.imageUrl), label: item.title, sub: `${item.width} × ${item.height}` })) : null,
      focus
    );
  }, [scene, rail, templates, focus, studio]);
  useEffect(() => () => scene?.setRail(null, 0), [scene]);

  const choose = () => {
    if (!template) return;
    studio.apply(composeOnTemplate(template, fresh ? null : composition));
    go({ kind: "cosplan", step: "board" });
  };
  const openRail = (blank: boolean) => {
    setFresh(blank);
    setRailOpen(true);
    setMenuFocus(0);
  };
  const turn = (delta: number) => templates.length && setFocus((f) => Math.max(0, Math.min(templates.length - 1, f + delta)));
  const items: MenuItem[] = rail
    ? [
        ...(template ? [{ key: "use", label: t("creatorUseBackground"), sub: `${template.width} × ${template.height} PX`, run: choose }] : []),
        ...(composition ? [{ key: "keep", label: t("creatorKeepBackground"), sub: composition.templateTitle, run: () => setRailOpen(false) }] : [])
      ]
    : composition
      ? [
          { key: "continue", label: t("creatorContinue"), sub: composition.templateTitle, run: () => go({ kind: "cosplan", step: "board" }) },
          { key: "change", label: tc("changeTemplate"), sub: t("creatorChangeBackgroundSub"), run: () => openRail(false) },
          { key: "new", label: tc("startNew"), sub: t("creatorStartNewSub"), run: () => openRail(true) }
        ]
      : [];
  const menuAt = Math.min(menuFocus, items.length - 1);

  useScreenKeys((k, target) => {
    if (status === "reading") return false;
    if (rail && (k === "ArrowLeft" || k === "ArrowRight")) turn(k === "ArrowLeft" ? -1 : 1);
    else if (k === "ArrowUp") setMenuFocus((f) => wrap(f - 1, items.length));
    else if (k === "ArrowDown") setMenuFocus((f) => wrap(f + 1, items.length));
    else if (k === "Enter" && !isInteractive(target)) items[menuAt]?.run();
    else if (k === "Escape" && railOpen && composition) setRailOpen(false);
    else return false;
    return true;
  });

  useStageInput((input) => {
    if (input.kind === "swipe" && rail && input.x) turn(input.x);
    else if (input.kind === "wheel" && rail) turn(input.direction);
    else if (input.kind === "pick" && input.index >= RAIL_PICK) {
      const index = input.index - RAIL_PICK;
      if (index === focus) choose();
      else setFocus(index);
    } else if (input.kind === "pick" && input.index === 0) {
      if (rail) choose();
      else if (composition) go({ kind: "cosplan", step: "board" });
    }
  });

  const heading = status === "reading" ? t("creatorReading") : rail ? tc("chooseBackground") : composition ? tc("restoreTitle") : tc("noTemplates");

  return (
    <>
      <BookingPanel>
        <p className={metaLabel}>
          {t("menuCosplan")}
          {rail && templates.length > 0 && (
            <>
              <span aria-hidden="true" className="mx-2">／</span>
              {pad(focus + 1)} / {pad(templates.length)}
            </>
          )}
        </p>
        <h1 className="mt-3 text-[2.25rem] font-extrabold uppercase leading-[0.95] tracking-[-0.04em] wide:text-[3.5rem]">{heading}</h1>
        <div aria-hidden="true" className={styles.calloutRule} />
        {status === "ready" && (
          <>
            {rail && template && <p className={`${metaLabel} mt-6`}>{template.title}</p>}
            <p className="mt-3 max-w-md text-sm text-fg-muted">
              {rail
                ? templates.length
                  ? t(fresh || !composition ? "creatorBackgroundHintBlank" : "creatorBackgroundHint")
                  : tc("noTemplatesHint")
                : composition
                  ? tc("restoreHint", { title: composition.templateTitle })
                  : tc("noTemplatesHint")}
            </p>
            {rail && templates.length > 1 && (
              <div className="mt-4 flex gap-2">
                <button type="button" onClick={() => turn(-1)} disabled={focus === 0} aria-label={t("creatorPrevious")} className="min-h-11 min-w-11 border border-border-strong text-lg disabled:opacity-30">‹</button>
                <button type="button" onClick={() => turn(1)} disabled={focus >= templates.length - 1} aria-label={t("creatorNext")} className="min-h-11 min-w-11 border border-border-strong text-lg disabled:opacity-30">›</button>
              </div>
            )}
            {items.length > 0 && <GameMenu label={t("menuCosplan")} className="mt-6" focus={menuAt} onFocus={setMenuFocus} items={items} />}
          </>
        )}
      </BookingPanel>
      {!touch && status === "ready" && (
        <Hints
          className={styles.menuHint}
          parts={[
            ...(rail ? [`${key("sides")} ${t("creatorHintTurn")}`] : []),
            `${key("move")} ${t("hintSelect")}`,
            `${key("confirm")} ${t("hintOpen")}`,
            `${key("back")} ${t("hintBack")}`
          ]}
        />
      )}
    </>
  );
}
