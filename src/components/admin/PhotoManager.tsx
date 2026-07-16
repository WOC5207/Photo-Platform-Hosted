"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  bulkDeletePhotos,
  bulkSetPhotoCredit,
  deletePhoto,
  movePhoto,
  setCoverPhoto,
  toggleHomeHighlight,
  updatePhotoCredits,
  updatePhotoExif
} from "@/app/[locale]/admin/(protected)/events/actions";
import SocialLinksEditor, {
  emptySocialLink,
  type SocialLinkValue
} from "./SocialLinksEditor";

export interface AdminPhotoCredit {
  creditName: string;
  subject: string;
  socialLinks: { platform: string; url: string }[];
}

export interface CreditProfile {
  creditName: string;
  socialLinks: { platform: string; url: string }[];
}

export interface AdminPhotoExif {
  focalLengthMm: string;
  aperture: string;
  exposureTime: string;
  iso: string;
  takenAt: string;
  cameraModel: string;
  lensModel: string;
}

export interface AdminPhoto {
  id: string;
  thumbUrl: string;
  credits: AdminPhotoCredit[];
  isCover: boolean;
  homeHighlight: boolean;
  exif: AdminPhotoExif;
}

const btnCls =
  "rounded-md border border-border-strong px-2 py-1 text-xs text-fg-muted transition hover:border-fg-faint hover:text-fg disabled:opacity-40";
const smallInputCls =
  "min-w-0 flex-1 rounded-md border border-border-strong bg-page px-2 py-1 text-xs text-fg outline-none focus:border-fg-subtle";

let rowKeySeq = 0;
interface CreditRow {
  key: number;
  creditName: string;
  subject: string;
  socialLinks: SocialLinkValue[];
  // The name this row's social links currently reflect — lets us tell when
  // the name has moved on to a different person and the links need to
  // follow, instead of lingering from whoever was typed before.
  linksSourceName: string;
}
function makeRow(initial?: AdminPhotoCredit): CreditRow {
  return {
    key: rowKeySeq++,
    creditName: initial?.creditName ?? "",
    subject: initial?.subject ?? "",
    socialLinks: (initial?.socialLinks ?? []).map((s) => emptySocialLink(s)),
    linksSourceName: (initial?.creditName ?? "").trim()
  };
}

function CreditsForm({
  photoId,
  initial,
  creditProfiles,
  creditTerm,
  subjectTerm
}: {
  photoId: string;
  initial: AdminPhotoCredit[];
  creditProfiles: CreditProfile[];
  creditTerm: string;
  subjectTerm: string;
}) {
  const t = useTranslations("adminEvents");
  const tc = useTranslations("common");
  const [rows, setRows] = useState<CreditRow[]>(() =>
    initial.length > 0 ? initial.map((c) => makeRow(c)) : [makeRow()]
  );

  function updateRow(key: number, patch: Partial<CreditRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  // Keep a row's social links in sync with whichever name is currently typed
  // in it: once the admin finishes editing the name, if it's actually
  // changed since the links were last synced, replace them with the new
  // name's remembered profile (or clear them if there's no match) — so links
  // never linger from a name that's since been cleared or swapped for
  // someone else.
  function syncLinksToName(key: number, typedName: string) {
    const name = typedName.trim();
    setRows((rs) =>
      rs.map((r) => {
        if (r.key !== key || name === r.linksSourceName) return r;
        const profile = creditProfiles.find((c) => c.creditName === name);
        return {
          ...r,
          linksSourceName: name,
          socialLinks: profile ? profile.socialLinks.map((s) => emptySocialLink(s)) : []
        };
      })
    );
  }

  const creditsJson = JSON.stringify(
    rows.map((r) => ({
      creditName: r.creditName,
      subject: r.subject,
      socialLinks: r.socialLinks.map((s) => ({ platform: s.platform, url: s.url }))
    }))
  );

  return (
    <form action={updatePhotoCredits} className="flex flex-col gap-2">
      <input type="hidden" name="photoId" value={photoId} />
      <input type="hidden" name="creditsJson" value={creditsJson} />
      {rows.map((row) => (
        <div
          key={row.key}
          className="flex flex-col gap-1 rounded-md border border-border-strong/40 p-1.5"
        >
          <div className="flex gap-1">
            <input
              value={row.creditName}
              onChange={(e) => updateRow(row.key, { creditName: e.target.value })}
              onBlur={(e) => syncLinksToName(row.key, e.target.value)}
              placeholder={t("creditName", { term: creditTerm })}
              maxLength={200}
              list="known-credits"
              className={smallInputCls}
            />
            <input
              value={row.subject}
              onChange={(e) => updateRow(row.key, { subject: e.target.value })}
              placeholder={subjectTerm}
              maxLength={200}
              className={smallInputCls}
            />
            {rows.length > 1 && (
              <button
                type="button"
                aria-label={t("removeCreditAria", { term: creditTerm })}
                onClick={() => setRows((r) => r.filter((x) => x.key !== row.key))}
                className={btnCls}
              >
                ×
              </button>
            )}
          </div>
          <SocialLinksEditor
            links={row.socialLinks}
            onChange={(links) => updateRow(row.key, { socialLinks: links })}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={() => setRows((r) => [...r, makeRow()])}
        className={`${btnCls} self-start`}
      >
        + {t("addCredit", { term: creditTerm })}
      </button>
      <button type="submit" className={`${btnCls} self-start`}>
        {tc("save")}
      </button>
    </form>
  );
}

function ExifForm({
  photoId,
  initial
}: {
  photoId: string;
  initial: AdminPhotoExif;
}) {
  const t = useTranslations("adminEvents");
  const tc = useTranslations("common");
  // Most photos already have EXIF read automatically; keep this tucked away
  // so it doesn't clutter every card, and only default open when something
  // is actually missing.
  const [open, setOpen] = useState(
    () =>
      !initial.focalLengthMm &&
      !initial.aperture &&
      !initial.exposureTime &&
      !initial.iso &&
      !initial.cameraModel &&
      !initial.lensModel
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${btnCls} self-start`}
      >
        {t("editExif")}
      </button>
    );
  }

  return (
    <form
      action={updatePhotoExif}
      className="flex flex-col gap-1 rounded-md border border-border-strong/40 p-1.5"
    >
      <input type="hidden" name="photoId" value={photoId} />
      <div className="grid grid-cols-2 gap-1">
        <input
          name="exifCameraModel"
          defaultValue={initial.cameraModel}
          placeholder={t("exifCameraModel")}
          maxLength={200}
          className={smallInputCls}
        />
        <input
          name="exifLensModel"
          defaultValue={initial.lensModel}
          placeholder={t("exifLensModel")}
          maxLength={200}
          className={smallInputCls}
        />
        <input
          name="exifFocalLengthMm"
          defaultValue={initial.focalLengthMm}
          placeholder={t("exifFocalLength")}
          inputMode="decimal"
          className={smallInputCls}
        />
        <input
          name="exifAperture"
          defaultValue={initial.aperture}
          placeholder={t("exifAperture")}
          inputMode="decimal"
          className={smallInputCls}
        />
        <input
          name="exifExposureTime"
          defaultValue={initial.exposureTime}
          placeholder={t("exifExposureTime")}
          className={smallInputCls}
        />
        <input
          name="exifIso"
          defaultValue={initial.iso}
          placeholder={t("exifIso")}
          inputMode="numeric"
          className={smallInputCls}
        />
        <input
          name="exifTakenAt"
          type="date"
          defaultValue={initial.takenAt}
          aria-label={t("exifTakenAt")}
          className={smallInputCls}
        />
      </div>
      <div className="flex gap-2">
        <button type="submit" className={`${btnCls} self-start`}>
          {tc("save")}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={`${btnCls} self-start`}
        >
          {tc("cancel")}
        </button>
      </div>
    </form>
  );
}

/** Toolbar filtering photos by credit name, plus bulk select/delete/tag. */
function BulkToolbar({
  creditTerm,
  subjectTerm,
  creditNames,
  filterName,
  onFilterChange,
  visibleIds,
  selected,
  onSelectAllVisible,
  onClearSelection
}: {
  creditTerm: string;
  subjectTerm: string;
  creditNames: string[];
  filterName: string;
  onFilterChange: (name: string) => void;
  visibleIds: string[];
  selected: Set<string>;
  onSelectAllVisible: () => void;
  onClearSelection: () => void;
}) {
  const t = useTranslations("adminEvents");
  const selectedIds = Array.from(selected);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-fg-muted">
            {t("bulkFilterLabel", { term: creditTerm })}
          </span>
          <select
            value={filterName}
            onChange={(e) => onFilterChange(e.target.value)}
            className="rounded-md border border-border-strong bg-page px-2 py-1 text-sm text-fg outline-none focus:border-fg-subtle"
          >
            <option value="">{t("bulkFilterAll")}</option>
            {creditNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={onSelectAllVisible}
          disabled={visibleIds.length === 0}
          className={btnCls}
        >
          {t("bulkSelectAllVisible")}
        </button>
        <button
          type="button"
          onClick={onClearSelection}
          disabled={selected.size === 0}
          className={btnCls}
        >
          {t("bulkClearSelection")}
        </button>
        <span className="text-xs text-fg-subtle">
          {t("bulkSelectedCount", { count: selected.size })}
        </span>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-end gap-3 border-t border-border-strong/40 pt-3">
          <form
            action={bulkSetPhotoCredit}
            onSubmit={onClearSelection}
            className="flex flex-wrap items-end gap-2"
          >
            {selectedIds.map((id) => (
              <input key={id} type="hidden" name="photoIds" value={id} />
            ))}
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-fg-muted">
                {t("creditName", { term: creditTerm })}
              </span>
              <input name="creditName" maxLength={200} className={smallInputCls} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-fg-muted">{subjectTerm}</span>
              <input name="subject" maxLength={200} className={smallInputCls} />
            </label>
            <button type="submit" className={btnCls}>
              {t("bulkSetCreditButton")}
            </button>
          </form>

          <form
            action={bulkDeletePhotos}
            onSubmit={(e) => {
              if (!confirm(t("confirmBulkDeletePhotos", { count: selected.size }))) {
                e.preventDefault();
                return;
              }
              onClearSelection();
            }}
          >
            {selectedIds.map((id) => (
              <input key={id} type="hidden" name="photoIds" value={id} />
            ))}
            <button
              type="submit"
              className={`${btnCls} border-danger-border text-danger hover:border-danger hover:text-danger-strong`}
            >
              {t("bulkDeleteSelected")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default function PhotoManager({
  photos,
  creditProfiles,
  creditTerm,
  subjectTerm
}: {
  photos: AdminPhoto[];
  creditProfiles: CreditProfile[];
  creditTerm: string;
  subjectTerm: string;
}) {
  const t = useTranslations("adminEvents");
  const tc = useTranslations("common");

  const [filterName, setFilterName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const creditNames = useMemo(() => {
    const names = new Set<string>();
    for (const p of photos) {
      for (const c of p.credits) {
        const name = c.creditName.trim();
        if (name) names.add(name);
      }
    }
    return Array.from(names).sort();
  }, [photos]);

  const visible = useMemo(() => {
    const indexed = photos.map((photo, index) => ({ photo, index }));
    if (!filterName) return indexed;
    return indexed.filter(({ photo }) =>
      photo.credits.some((c) => c.creditName.trim() === filterName)
    );
  }, [photos, filterName]);

  function handleFilterChange(name: string) {
    setFilterName(name);
    setSelected(new Set());
  }

  function toggleSelected(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected((s) => {
      const next = new Set(s);
      for (const { photo } of visible) next.add(photo.id);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  if (photos.length === 0) {
    return <p className="text-sm text-fg-subtle">{t("noPhotos")}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <BulkToolbar
        creditTerm={creditTerm}
        subjectTerm={subjectTerm}
        creditNames={creditNames}
        filterName={filterName}
        onFilterChange={handleFilterChange}
        visibleIds={visible.map(({ photo }) => photo.id)}
        selected={selected}
        onSelectAllVisible={selectAllVisible}
        onClearSelection={clearSelection}
      />

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map(({ photo, index: i }) => (
          <li
            key={photo.id}
            className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3"
          >
            <label className="flex items-center gap-2 text-xs text-fg-muted">
              <input
                type="checkbox"
                checked={selected.has(photo.id)}
                onChange={() => toggleSelected(photo.id)}
                className="h-4 w-4 accent-fg"
              />
              {t("bulkSelectPhotoLabel")}
            </label>

            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.thumbUrl}
                alt=""
                loading="lazy"
                className="aspect-[4/3] w-full rounded-lg object-cover"
              />
              {photo.isCover && (
                <span className="absolute left-2 top-2 rounded-md bg-white/90 px-2 py-0.5 text-xs font-semibold text-neutral-900">
                  {t("cover")}
                </span>
              )}
              {photo.homeHighlight && (
                <span className="absolute right-2 top-2 rounded-md bg-yellow-400/95 px-2 py-0.5 text-xs font-semibold text-neutral-900">
                  {t("homeHighlight")}
                </span>
              )}
            </div>

            <CreditsForm
              photoId={photo.id}
              initial={photo.credits}
              creditProfiles={creditProfiles}
              creditTerm={creditTerm}
              subjectTerm={subjectTerm}
            />
            <ExifForm photoId={photo.id} initial={photo.exif} />

            <div className="flex flex-wrap gap-2">
              <form action={movePhoto}>
                <input type="hidden" name="photoId" value={photo.id} />
                <input type="hidden" name="direction" value="up" />
                <button type="submit" disabled={i === 0} className={btnCls}>
                  ← {t("moveUp")}
                </button>
              </form>
              <form action={movePhoto}>
                <input type="hidden" name="photoId" value={photo.id} />
                <input type="hidden" name="direction" value="down" />
                <button
                  type="submit"
                  disabled={i === photos.length - 1}
                  className={btnCls}
                >
                  {t("moveDown")} →
                </button>
              </form>
              {!photo.isCover && (
                <form action={setCoverPhoto}>
                  <input type="hidden" name="photoId" value={photo.id} />
                  <button type="submit" className={btnCls}>
                    {t("setCover")}
                  </button>
                </form>
              )}
              <form action={toggleHomeHighlight}>
                <input type="hidden" name="photoId" value={photo.id} />
                <button
                  type="submit"
                  className={
                    photo.homeHighlight
                      ? `${btnCls} border-fg-faint bg-fg/10 text-fg`
                      : btnCls
                  }
                >
                  {photo.homeHighlight
                    ? t("removeHomeHighlight")
                    : t("addHomeHighlight")}
                </button>
              </form>
              <form
                action={deletePhoto}
                onSubmit={(e) => {
                  if (!confirm(t("confirmDeletePhoto"))) e.preventDefault();
                }}
              >
                <input type="hidden" name="photoId" value={photo.id} />
                <button
                  type="submit"
                  className={`${btnCls} border-danger-border text-danger hover:border-danger hover:text-danger-strong`}
                >
                  {tc("delete")}
                </button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
