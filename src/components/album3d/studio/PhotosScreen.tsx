"use client";

import { lazy, Suspense, useEffect, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  bulkDeletePhotos,
  bulkSetPhotoCredit,
  movePhoto,
  publishEvent,
  setCoverPhoto,
  toggleHomeHighlight
} from "@/app/[locale]/dashboard/(protected)/events/actions";
import { Hints, Rolling, pad } from "../hud";
import styles from "../ArchiveSite.module.css";
import { tableColumns } from "../types";
import {
  BookingPanel,
  fieldClass,
  isInteractive,
  metaLabel,
  primaryClass,
  secondaryClass,
  StepButtons,
  useScreenKeys,
  useStage,
  useStageInput
} from "../booking/shared";
import { FormNote, StudioHeading } from "./shared";
import { useStudioTable } from "./table";
import type { StudioAccount, StudioEventDetail, StudioPhoto } from "./types";

const PhotosPhoneLoupe = lazy(() => import("./PhotosPhoneLoupe"));

const form = (entries: [string, string][]) => {
  const data = new FormData();
  for (const [name, value] of entries) data.append(name, value);
  return data;
};

/**
 * The photo manager on the light table: walk the prints, pick some, and act
 * on the focused one (cover, homepage, order, credit) or on the picked ones
 * (credit, delete). Every change goes through the classic dashboard's
 * actions, and the table lays itself out again from what the server sends.
 */
export default function PhotosScreen({
  account,
  event,
  photos,
  creditTerm,
  subjectTerm,
  knownCredits
}: {
  account: StudioAccount;
  event: StudioEventDetail;
  photos: StudioPhoto[];
  creditTerm: string;
  subjectTerm: string;
  knownCredits: string[];
}) {
  const t = useTranslations("album3d");
  const ta = useTranslations("adminEvents");
  const tc = useTranslations("common");
  const { path, key, touch } = useStage();
  const [focus, setFocus] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [confirming, setConfirming] = useState<"one" | "picked" | null>(null);
  const [busy, startBusy] = useTransition();
  const [published, setPublished] = useState(event.published);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [credit, setCredit] = useState("");
  const [subject, setSubject] = useState("");
  const { username } = account;
  useEffect(() => setPublished(event.published), [event.published]);

  // Picks follow their photos when the table is laid out again.
  const pickedIndexes = useMemo(
    () => picked.map((id) => photos.findIndex((p) => p.id === id)).filter((i) => i >= 0),
    [picked, photos]
  );
  useEffect(() => {
    setPicked((current) => current.filter((id) => photos.some((p) => p.id === id)));
    setFocus((current) => Math.min(current, Math.max(0, photos.length - 1)));
  }, [photos]);

  const portrait = useStudioTable(event.id, photos, focus, pickedIndexes);

  const photo = photos[focus];
  const targets = picked.length > 0 ? picked : photo ? [photo.id] : [];
  useEffect(() => {
    // The credit fields start from the focused photo's credit.
    if (picked.length === 0) {
      setCredit(photo?.credit ?? "");
      setSubject(photo?.subject ?? "");
    }
  }, [photo, picked.length]);

  const run = (action: (data: FormData) => Promise<unknown>, data: FormData, after?: () => void) =>
    startBusy(async () => {
      setFeedback(null);
      try {
        const res = (await action(data)) as { error?: string } | void;
        if (res && typeof res === "object" && res.error) {
          setFeedback({ tone: "error", text: t("studioSaveError") });
          return;
        }
        after?.();
        setFeedback({ tone: "ok", text: tc("saved") });
      } catch {
        setFeedback({ tone: "error", text: t("studioSaveError") });
      }
    });
  const togglePick = (index: number) => {
    const id = photos[index]?.id;
    if (!id) return;
    setPicked((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  };
  const moveFocus = (delta: number) => {
    if (photos.length === 0) return;
    setConfirming(null);
    setFocus((current) => Math.max(0, Math.min(photos.length - 1, current + delta)));
  };
  const reorder = (direction: "up" | "down") => {
    if (!photo) return;
    run(movePhoto, form([["photoId", photo.id], ["direction", direction]]), () =>
      setFocus((current) => Math.max(0, Math.min(photos.length - 1, current + (direction === "up" ? -1 : 1))))
    );
  };

  useScreenKeys((k, target) => {
    const across = tableColumns(window.innerWidth, window.innerHeight);
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -across, ArrowDown: across };
    if (k in moves) moveFocus(moves[k]);
    else if ((k === "Enter" || k === " ") && !isInteractive(target)) togglePick(focus);
    else return false;
    return true;
  });
  useStageInput((input) => {
    if (input.kind === "pick") {
      // The table already went there under a drag or the wheel.
      if (input.moved) {
        setConfirming(null);
        setFocus(input.index);
      } else if (input.index === focus) togglePick(input.index);
      else moveFocus(input.index - focus);
    } else if (input.kind === "wheel") moveFocus(input.direction * tableColumns(window.innerWidth, window.innerHeight));
  });

  const status = photo
    ? [
        photo.cover && ta("cover"),
        photo.highlight && ta("homeHighlight"),
        !photo.visible && t(`studioScreening_${photo.screening}`)
      ].filter(Boolean)
    : [];

  return (
    <>
      <BookingPanel work>
        <StudioHeading trail={event.title} title={t("studioPhotos")}>
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="font-meta text-[0.625rem] uppercase tracking-[0.14em] text-fg-subtle">
              {photos.length > 0 ? (
                <>
                  {t("studioPrint")}{" "}
                  <span className="text-fg">
                    <Rolling value={pad(focus + 1)} />
                  </span>{" "}
                  / {pad(photos.length)}
                </>
              ) : (
                ta("photosCount", { count: 0 })
              )}
            </p>
            {photos.length > 1 && <StepButtons onStep={moveFocus} atStart={focus === 0} atEnd={focus >= photos.length - 1} />}
          </div>
        </StudioHeading>

        {!published && (
          <div className="mt-5 grid gap-2 border-l-2 border-accent bg-accent-surface p-3">
            <p className="text-xs font-semibold text-fg">{ta("draftBannerTitle")}</p>
            <p className="text-xs text-fg-muted">{ta("draftBannerHint")}</p>
            <button
              type="button"
              disabled={busy}
              onClick={() => run(publishEvent, form([["id", event.id]]), () => setPublished(true))}
              className={`${primaryClass} mt-1 w-full`}
            >
              {ta("publishAlbumNow")} <span aria-hidden="true">→</span>
            </button>
          </div>
        )}

        {feedback && <FormNote tone={feedback.tone}>{feedback.text}</FormNote>}

        <div className="mt-5 grid gap-2">
          <Link href={path({ kind: "studio", username, page: "upload", id: event.id })} scroll={false} className={published ? primaryClass : secondaryClass}>
            {event.pendingCount > 0 ? ta("resumePhotos", { count: event.pendingCount }) : ta("addPhotos")}
            <span aria-hidden="true" className="text-lg">+</span>
          </Link>
        </div>

        {photo ? (
          <section aria-label={t("studioFocused")} aria-busy={busy} className="mt-5 grid gap-3">
            {portrait ? (
              <Suspense
                fallback={
                  <div className="flex h-[38dvh] min-h-[220px] items-center justify-center border border-border-strong bg-control/80">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.med} alt={photo.name} className="h-full w-full object-contain" />
                  </div>
                }
              >
                <PhotosPhoneLoupe
                  photos={photos}
                  focus={focus}
                  picked={picked}
                  status={status}
                  busy={busy}
                  onFocus={(i) => {
                    setConfirming(null);
                    setFocus(i);
                  }}
                  onStep={moveFocus}
                  onTogglePick={() => togglePick(focus)}
                  onCover={() => run(setCoverPhoto, form([["photoId", photo.id]]))}
                  onHighlight={() => run(toggleHomeHighlight, form([["photoId", photo.id]]))}
                />
              </Suspense>
            ) : (
              <div className="flex items-start gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.thumb} alt="" className="h-24 w-24 shrink-0 bg-control object-contain" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{photo.name}</p>
                  {status.length > 0 && <p className="font-meta mt-1 text-[0.625rem] uppercase tracking-[0.12em] text-accent-text">{status.join(" · ")}</p>}
                  <p className="mt-1 text-xs text-fg-muted">{photo.credit ? [photo.credit, photo.subject].filter(Boolean).join(" · ") : ta("photoNoCredits")}</p>
                  <label className="mt-2 flex min-h-9 items-center gap-2 text-xs font-semibold">
                    <input type="checkbox" checked={picked.includes(photo.id)} onChange={() => togglePick(focus)} className="h-4 w-4 accent-[var(--color-accent)]" />
                    {t("studioPick")}
                  </label>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy || photo.cover || !photo.visible}
                onClick={() => run(setCoverPhoto, form([["photoId", photo.id]]))}
                className={secondaryClass}
              >
                {photo.cover ? ta("cover") : ta("setCover")}
              </button>
              <button
                type="button"
                disabled={busy || !photo.visible}
                onClick={() => run(toggleHomeHighlight, form([["photoId", photo.id]]))}
                className={secondaryClass}
              >
                {photo.highlight ? ta("removeHomeHighlight") : ta("addHomeHighlight")}
              </button>
              <button type="button" disabled={busy || focus === 0} onClick={() => reorder("up")} className={secondaryClass}>
                ← {ta("moveUp")}
              </button>
              <button type="button" disabled={busy || focus === photos.length - 1} onClick={() => reorder("down")} className={secondaryClass}>
                {ta("moveDown")} →
              </button>
            </div>
            {!photo.visible && <p className="text-xs text-fg-subtle">{t("studioScreeningDisabledHint")}</p>}
          </section>
        ) : (
          <p className="mt-6 text-sm text-fg-muted">{t("studioPhotosEmpty")}</p>
        )}

        {targets.length > 0 && (
          <form
            className="mt-6 grid gap-3 border-t border-border pt-5"
            onSubmit={(e) => {
              e.preventDefault();
              run(bulkSetPhotoCredit, form([...targets.map((id): [string, string] => ["photoIds", id]), ["creditName", credit], ["subject", subject]]));
            }}
          >
            <h2 className={metaLabel}>
              {picked.length > 0 ? t("studioCreditPicked", { term: creditTerm, count: picked.length }) : t("studioCreditOne", { term: creditTerm })}
            </h2>
            <datalist id="studio-known-credits">
              {knownCredits.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1 text-xs font-semibold text-fg-muted">
                {ta("creditName", { term: creditTerm })}
                <input value={credit} onChange={(e) => setCredit(e.target.value)} list="studio-known-credits" maxLength={200} required className={fieldClass} />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-fg-muted">
                {subjectTerm}
                <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} className={fieldClass} />
              </label>
            </div>
            <button type="submit" disabled={busy || !credit.trim()} className={secondaryClass}>
              {ta("bulkSetCreditButton")}
            </button>
          </form>
        )}

        <div className="mt-6 grid gap-3 border-t border-border pt-5">
          <div className="flex flex-wrap items-center gap-2">
            <p className={`${metaLabel} mr-auto`}>{ta("bulkSelectedCount", { count: picked.length })}</p>
            <button type="button" onClick={() => setPicked(photos.map((p) => p.id))} disabled={photos.length === 0} className="min-h-9 px-2 text-xs underline-offset-4 hover:underline">
              {ta("bulkSelectAllVisible")}
            </button>
            <button type="button" onClick={() => setPicked([])} disabled={picked.length === 0} className="min-h-9 px-2 text-xs underline-offset-4 hover:underline disabled:opacity-40">
              {ta("bulkClearSelection")}
            </button>
          </div>
          {confirming ? (
            <div className="grid gap-2">
              <p role="alert" className="text-sm font-semibold text-danger">
                {confirming === "picked" ? t("studioDeletePicked", { count: picked.length }) : ta("confirmDeletePhoto")}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    run(bulkDeletePhotos, form((confirming === "picked" ? picked : photo ? [photo.id] : []).map((id) => ["photoIds", id])), () => {
                      setConfirming(null);
                      setPicked([]);
                    })
                  }
                  className={`${secondaryClass} border-danger text-danger`}
                >
                  {confirming === "picked" ? ta("bulkDeleteSelected") : tc("delete")}
                </button>
                <button type="button" onClick={() => setConfirming(null)} className={secondaryClass}>
                  {tc("cancel")}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={!photo} onClick={() => setConfirming("one")} className={`${secondaryClass} text-danger`}>
                {t("studioDeleteThis")}
              </button>
              {picked.length > 0 && (
                <button type="button" onClick={() => setConfirming("picked")} className={`${secondaryClass} text-danger`}>
                  {ta("bulkDeleteSelected")}
                </button>
              )}
            </div>
          )}
        </div>
      </BookingPanel>
      {!touch && photos.length > 0 && (
        <Hints
          className={styles.menuHint}
          parts={[`← → ↑ ↓ ${t("hintPrint")}`, `${key("confirm")} ${t("studioPick")}`, `${key("back")} ${t("hintBack")}`]}
        />
      )}
    </>
  );
}
