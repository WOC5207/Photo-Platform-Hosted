"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { GameMenu, Hints, pad, wrap, type MenuItem } from "../../hud";
import styles from "../../ArchiveSite.module.css";
import { BookingPanel, isInteractive, metaLabel, useScene, useScreenKeys, useStage, useStageDrag, useStageInput } from "../../booking/shared";
import { RAIL_PICK } from "../../types";
import { paintBlankPoster } from "../shared";
import { photoAt, useMatPaint } from "./mat";
import { useSharepostStudio } from "./SharepostStudio";
import { SharepostSteps } from "./SharepostSteps";

const ACCEPT = "image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif";
// Only a saved project picks from galleries, so the public creator never loads it.
const SharepostGallery = lazy(() => import("./SharepostGallery"));

/**
 * Create Sharepost, first screen: the poster stands on the easel, laid out
 * live, and the visitor's photographs stand as prints on a rail in front of
 * it with a reticle on the focused one. Dragging a photograph on the poster
 * onto another moves it there in the sequence.
 */
export default function SharepostPhotos() {
  const t = useTranslations("album3d");
  const ts = useTranslations("sharingPosters");
  const { key, touch, go } = useStage();
  const scene = useScene("poster");
  const studio = useSharepostStudio();
  const { composition, photos, status, tools } = studio;
  const [focus, setFocus] = useState(0);
  const [menuFocus, setMenuFocus] = useState(0);
  const [drag, setDrag] = useState<{ id: string; over: string | null; moved: boolean } | null>(null);
  const [picking, setPicking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const max = tools?.SHARING_POSTER_MAX_PHOTOS ?? 9;
  const at = Math.min(focus, Math.max(0, photos.length - 1));
  const focused = photos[at] ?? null;

  useMatPaint(scene, studio, { selected: drag ? (drag.over ?? drag.id) : focused?.photoId, blank: (canvas) => paintBlankPoster(canvas, t("creatorAddPhotosBlank")) });

  useEffect(() => {
    if (!scene) return;
    scene.setRail(
      photos.length
        ? photos.map((photo, i) => ({
            key: photo.photoId,
            image: studio.thumb(photo.source?.thumbUrl),
            label: `${pad(i + 1)} / ${pad(photos.length)}`,
            sub: photo.source ? `${photo.source.width} × ${photo.source.height}` : t("creatorPhotoMissing")
          }))
        : null,
      at
    );
  }, [scene, photos, at, studio, t]);
  useEffect(() => () => scene?.setRail(null, 0), [scene]);

  const move = (delta: number) => photos.length && setFocus(Math.max(0, Math.min(photos.length - 1, at + delta)));
  const shift = (delta: number) => {
    if (!focused) return;
    studio.movePhoto(focused.photoId, at + delta);
    setFocus(Math.max(0, Math.min(photos.length - 1, at + delta)));
  };

  const items: MenuItem[] = [
    {
      key: "add",
      label: studio.reading ? ts("localReading", studio.reading) : ts("localAddButton"),
      sub: `${photos.length} / ${max}`,
      run: () => (studio.project ? setPicking(!picking) : photos.length < max && !studio.reading && inputRef.current?.click())
    },
    ...(focused && photos.length > 1
      ? [
          { key: "earlier", label: t("creatorMoveEarlier"), sub: `${pad(at + 1)} → ${pad(Math.max(1, at))}`, run: () => shift(-1) },
          { key: "later", label: t("creatorMoveLater"), sub: `${pad(at + 1)} → ${pad(Math.min(photos.length, at + 2))}`, run: () => shift(1) }
        ]
      : []),
    ...(focused ? [{ key: "remove", label: ts("removePhoto"), sub: `${pad(at + 1)} / ${pad(photos.length)}`, run: () => studio.removePhoto(focused.photoId) }] : []),
    { key: "layout", label: t("creatorLayout"), sub: t("creatorLayoutSub"), run: () => go(studio.screen("layout")) },
    { key: "credits", label: t("creatorCredits"), sub: t("creatorCreditsSub"), run: () => go(studio.screen("credits")) },
    ...(photos.length ? [{ key: "print", label: t("creatorPrint"), sub: t("creatorPrintSharepostSub"), run: () => go(studio.screen("print")) }] : [])
  ];
  const menuAt = Math.min(menuFocus, items.length - 1);

  useScreenKeys((k, target) => {
    if (status !== "ready") return false;
    if (k === "ArrowLeft" || k === "ArrowRight") move(k === "ArrowLeft" ? -1 : 1);
    else if (k === "ArrowUp") setMenuFocus((f) => wrap(f - 1, items.length));
    else if (k === "ArrowDown") setMenuFocus((f) => wrap(f + 1, items.length));
    else if (k === "Enter" && !isInteractive(target)) items[menuAt]?.run();
    else if (k === "Delete" && focused) studio.removePhoto(focused.photoId);
    else return false;
    return true;
  });

  useStageInput((input) => {
    if (input.kind === "swipe" && input.x) move(input.x);
    else if (input.kind === "wheel") move(input.direction);
    else if (input.kind === "pick" && input.index >= RAIL_PICK) setFocus(input.index - RAIL_PICK);
  });

  // Drag a photograph on the poster onto another to move it there.
  const dragRef = useRef(drag);
  dragRef.current = drag;
  useStageDrag((input) => {
    if (!scene || !studio.metrics || input.phase === "wheel") return false;
    if (input.phase === "down") {
      if (dragRef.current) return false;
      const id = photoAt(scene, studio.metrics, input.clientX, input.clientY, input.rect);
      if (!id) return false;
      setDrag({ id, over: id, moved: false });
      return true;
    }
    const current = dragRef.current;
    if (!current) return true;
    if (input.phase === "move") {
      const over = photoAt(scene, studio.metrics, input.clientX, input.clientY, input.rect);
      if (over !== current.over) setDrag({ ...current, over, moved: true });
      return true;
    }
    setDrag(null);
    const index = photos.findIndex((photo) => photo.photoId === current.id);
    if (input.phase === "up" && !current.moved) setFocus(index);
    else if (input.phase === "up" && current.over && current.over !== current.id) {
      const to = photos.findIndex((photo) => photo.photoId === current.over);
      studio.movePhoto(current.id, to);
      setFocus(to);
    }
    return true;
  });

  return (
    <>
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
      <BookingPanel>
        <SharepostSteps current="photos" />
        <p className={metaLabel}>
          {t("menuPoster")}
          <span aria-hidden="true" className="mx-2">／</span>
          {t("creatorSharepostCount", { photos: photos.length })}
        </p>
        <h1 className="mt-3 text-[2.25rem] font-extrabold uppercase leading-[0.95] tracking-[-0.04em] wide:text-[3.5rem]">
          {status === "reading" ? t("creatorReading") : studio.name || t("menuPoster")}
        </h1>
        <div aria-hidden="true" className={styles.calloutRule} />
        {status === "ready" && composition && (
          <>
            <p className="mt-6 max-w-md text-sm text-fg-muted">{t(photos.length ? (touch ? "creatorPhotosHintTouch" : "creatorPhotosHint") : "creatorPhotosEmptyHint")}</p>
            {photos.length > 1 && (
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => move(-1)} disabled={at === 0} aria-label={t("creatorPrevious")} className="min-h-11 min-w-11 border border-border-strong text-lg disabled:opacity-30">‹</button>
                <button type="button" onClick={() => move(1)} disabled={at >= photos.length - 1} aria-label={t("creatorNext")} className="min-h-11 min-w-11 border border-border-strong text-lg disabled:opacity-30">›</button>
              </div>
            )}
            <GameMenu label={t("menuPoster")} className="mt-4" focus={menuAt} onFocus={setMenuFocus} items={items} />
            {picking && (
              <Suspense fallback={null}>
                <SharepostGallery onClose={() => setPicking(false)} />
              </Suspense>
            )}
            <p aria-live="polite" className="mt-3 min-h-5 text-sm text-fg-muted">
              {studio.readNotice.failed > 0 && <span className="block text-danger">{ts("localReadError", { count: studio.readNotice.failed })}</span>}
              {studio.readNotice.skipped > 0 && <span className="block">{ts("localSkipped", { count: studio.readNotice.skipped })}</span>}
              {photos.length >= max && <span className="block">{ts("localFull")}</span>}
            </p>
            <SaveState />
          </>
        )}
      </BookingPanel>
      {!touch && status === "ready" && (
        <Hints
          className={styles.menuHint}
          parts={[`${key("sides")} ${t("creatorHintPrints")}`, `${key("move")} ${t("hintSelect")}`, `${key("confirm")} ${t("hintOpen")}`, `${key("back")} ${t("hintBack")}`]}
        />
      )}
    </>
  );
}

/** Whether the draft is kept in this browser yet, and the way to keep it when the name is empty. */
export function SaveState() {
  const ts = useTranslations("sharingPosters");
  const { saved, name, project } = useSharepostStudio();
  if (saved === "conflict")
    return (
      <p role="alert" className="mt-2 text-sm text-danger">
        {ts("saveConflict")}. {ts("conflictHint")}{" "}
        <button type="button" onClick={() => window.location.reload()} className="underline underline-offset-4">
          {ts("reload")}
        </button>
      </p>
    );
  return (
    <p role="status" className="font-meta mt-2 text-[0.625rem] uppercase tracking-[0.12em] text-fg-subtle">
      {!name.trim() ? ts("projectNameRequired") : saved === "saved" ? ts(project ? "saved" : "localSaved") : saved === "error" ? ts("saveError") : saved === "dirty" ? ts("unsaved") : ""}
    </p>
  );
}
