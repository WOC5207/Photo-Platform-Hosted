"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { updateEvent, type EventFormState } from "@/app/[locale]/dashboard/(protected)/events/actions";
import { deleteEvent3d } from "@/app/[locale]/3d/u/[username]/studio/actions";
import { Hints } from "../hud";
import styles from "../ArchiveSite.module.css";
import { BookingPanel, fieldClass, isInteractive, primaryClass, secondaryClass, useScreenKeys, useStage, useStageInput } from "../booking/shared";
import { FormNote, StudioHeading } from "./shared";
import { useStudioTable } from "./table";
import type { StudioAccount, StudioEventDetail, StudioPhoto } from "./types";

/**
 * One event: its photos on the light table behind, and in the panel the
 * ways into them (manage, add), its details and publishing, and deleting it.
 */
export default function EventScreen({
  account,
  event,
  photos
}: {
  account: StudioAccount;
  event: StudioEventDetail;
  photos: StudioPhoto[];
}) {
  const t = useTranslations("album3d");
  const ta = useTranslations("adminEvents");
  const tw = useTranslations("eventWorkspace");
  const tc = useTranslations("common");
  const { go, path, key, touch } = useStage();
  const { username } = account;
  const [state, action, pending] = useActionState<EventFormState, FormData>(updateEvent, {});
  const [confirming, setConfirming] = useState(false);
  const label = "grid gap-1 text-sm font-semibold text-fg-muted";

  useStudioTable(event.id, photos, 0);
  const managePhotos = () => go({ kind: "studio", username, page: "photos", id: event.id });
  // A print on the table opens the photo manager.
  useStageInput((input) => {
    if (input.kind === "pick") managePhotos();
  });
  useScreenKeys((k, target) => {
    if (k !== "Enter" || isInteractive(target)) return false;
    managePhotos();
    return true;
  });

  return (
    <>
      <BookingPanel expanded>
        <StudioHeading trail={t("studioEvents")} title={event.title}>
          <p className="font-meta mt-3 text-[0.625rem] uppercase tracking-[0.14em] text-fg-subtle">
            {[event.dateLabel || tw("noDate"), event.location, tw("photoCount", { count: event.photoCount }), event.published ? tw("published") : tw("draft")]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </StudioHeading>

        <div className="mt-6 grid gap-2">
          <Link href={path({ kind: "studio", username, page: "photos", id: event.id })} scroll={false} className={primaryClass}>
            {t("studioManagePhotos", { count: event.photoCount })}
            <span aria-hidden="true" className="text-lg">→</span>
          </Link>
          <Link href={path({ kind: "studio", username, page: "upload", id: event.id })} scroll={false} className={secondaryClass}>
            {event.pendingCount > 0 ? ta("resumePhotos", { count: event.pendingCount }) : ta("addPhotos")}
            <span aria-hidden="true" className="ml-auto">+</span>
          </Link>
          {event.bookingId && (
            <Link href={path({ kind: "studio", username, page: "booking", id: event.bookingId })} scroll={false} className={secondaryClass}>
              {t("studioBookingPage")}
              <span aria-hidden="true" className="ml-auto">→</span>
            </Link>
          )}
          {event.publicPath && (
            <Link href={event.publicPath} className={secondaryClass}>
              {t("studioViewAlbum")}
              <span aria-hidden="true" className="ml-auto">↗</span>
            </Link>
          )}
        </div>

        <form action={action} aria-busy={pending} className="mt-8 grid gap-4">
          <h2 className="font-meta text-[0.625rem] uppercase tracking-[0.16em] text-fg-subtle">{t("studioDetails")}</h2>
          <input type="hidden" name="id" value={event.id} />
          <label className="flex min-h-11 items-center gap-3 border border-border-strong px-3 text-sm font-semibold">
            <input type="checkbox" name="published" defaultChecked={event.published} className="h-4 w-4 accent-[var(--color-accent)]" />
            {ta("publishedLabel")}
          </label>
          <label className={label}>
            {ta("titleEn")}
            <input name="titleEn" defaultValue={event.titleEn} maxLength={300} className={fieldClass} />
          </label>
          <label className={label}>
            {ta("titleZh")}
            <input name="titleZh" defaultValue={event.titleZh} maxLength={300} className={fieldClass} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={label}>
              {ta("dateStart")}
              <input type="date" name="dateStart" defaultValue={event.dateStart} className={fieldClass} />
            </label>
            <label className={label}>
              {ta("dateEnd")}
              <input type="date" name="dateEnd" defaultValue={event.dateEnd} className={fieldClass} />
            </label>
          </div>
          <label className={label}>
            {ta("location")}
            <input name="location" defaultValue={event.location} maxLength={300} className={fieldClass} />
          </label>
          <label className={label}>
            {ta("slug")}
            <input name="slug" defaultValue={event.slug} maxLength={100} pattern="[a-z0-9-]*" className={fieldClass} />
            <span className="text-xs font-normal text-fg-subtle">{ta("slugHint")}</span>
          </label>
          <label className={label}>
            {ta("descriptionEn")}
            <textarea name="descriptionEn" defaultValue={event.descriptionEn} rows={3} maxLength={5000} className={fieldClass} />
          </label>
          <label className={label}>
            {ta("descriptionZh")}
            <textarea name="descriptionZh" defaultValue={event.descriptionZh} rows={3} maxLength={5000} className={fieldClass} />
          </label>
          {state.error && <FormNote tone="error">{state.error === "validation" ? ta("validationError") : t("studioError")}</FormNote>}
          {state.ok && !pending && <FormNote tone="ok">{t("studioSaved")}</FormNote>}
          <button type="submit" disabled={pending} className={primaryClass}>
            {pending ? t("studioSaving") : tc("save")}
            <span aria-hidden="true" className="text-lg">→</span>
          </button>
        </form>

        <div className="mt-8 border-t border-border pt-5">
          {confirming ? (
            <form action={deleteEvent3d} className="grid gap-3">
              <input type="hidden" name="id" value={event.id} />
              <p role="alert" className="text-sm font-semibold text-danger">{ta("confirmDeleteEvent")}</p>
              <div className="flex flex-wrap gap-2">
                <button type="submit" className={`${secondaryClass} border-danger text-danger`}>{ta("deleteEvent")}</button>
                <button type="button" onClick={() => setConfirming(false)} className={secondaryClass}>{tc("cancel")}</button>
              </div>
            </form>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className={`${secondaryClass} text-danger`}>
              {ta("deleteEvent")}
            </button>
          )}
        </div>
      </BookingPanel>
      {!touch && (
        <Hints className={styles.menuHint} parts={[`${key("confirm")} ${t("studioPhotos")}`, `${key("back")} ${t("hintBack")}`]} />
      )}
    </>
  );
}
