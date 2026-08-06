"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  bulkDeletePhotos,
  bulkSetPhotoCredit,
  deletePhoto,
  movePhoto,
  setCoverPhoto,
  toggleHomeHighlight,
  updateHomeWeight,
  type HomeWeightFormState,
  updatePhotoCredits,
  updatePhotoExif,
  type PhotoExifFormState
} from "@/app/[locale]/dashboard/(protected)/events/actions";
import SocialLinksEditor, {
  emptySocialLink,
  type SocialLinkValue
} from "./SocialLinksEditor";
import { buttonClasses } from "@/components/ui/Button";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import type {
  ImageModerationCategory,
  PhotoModerationStatus
} from "@/lib/moderationPolicy";
import { moderationAllowsPublicPhoto } from "@/lib/photoVisibility";

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
  comment: string;
  isCover: boolean;
  homeHighlight: boolean;
  homeWeight: number;
  moderationStatus: PhotoModerationStatus;
  moderationCategories: ImageModerationCategory[];
  exif: AdminPhotoExif;
}

const btnCls =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-border-strong bg-raised px-3 py-2 text-xs font-semibold text-fg-muted transition-[color,background-color,border-color] hover:border-accent/40 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-40 max-sm:min-h-11";
const smallInputCls =
  "min-h-10 min-w-0 w-full rounded-lg border border-border-strong bg-control px-3 py-2 text-sm text-fg outline-none transition-[border-color,box-shadow] focus-visible:border-accent/60 focus-visible:ring-2 focus-visible:ring-accent/20";

function PhotoCardSection({
  title,
  summary,
  defaultOpen = false,
  children
}: {
  title: string;
  summary: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-lg border border-border bg-raised/60"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/35">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-fg">{title}</span>
          <span className="block truncate text-xs text-fg-subtle">{summary}</span>
        </span>
        <span
          aria-hidden="true"
          className="shrink-0 text-lg leading-none text-accent transition-transform group-open:rotate-45"
        >
          +
        </span>
      </summary>
      <div className="border-t border-border p-3">{children}</div>
    </details>
  );
}

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
  initialComment,
  creditProfiles,
  creditTerm,
  subjectTerm
}: {
  photoId: string;
  initial: AdminPhotoCredit[];
  initialComment: string;
  creditProfiles: CreditProfile[];
  creditTerm: string;
  subjectTerm: string;
}) {
  const t = useTranslations("adminEvents");
  const tc = useTranslations("common");
  const [rows, setRows] = useState<CreditRow[]>(() =>
    initial.length > 0 ? initial.map((c) => makeRow(c)) : [makeRow()]
  );
  const [comment, setComment] = useState(initialComment);

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

  const currentCredits = rows
    .map((r) => ({
      creditName: r.creditName,
      subject: r.subject,
      socialLinks: r.socialLinks.map((s) => ({
        platform: s.platform,
        url: s.url
      }))
    }))
    .filter(
      (credit) =>
        credit.creditName ||
        credit.subject ||
        credit.socialLinks.some((link) => link.platform || link.url)
    );
  const creditsJson = JSON.stringify(currentCredits);
  const initialJson = JSON.stringify(
    initial.map((credit) => ({
      creditName: credit.creditName,
      subject: credit.subject,
      socialLinks: credit.socialLinks
    }))
  );
  const dirty = creditsJson !== initialJson || comment !== initialComment;
  useUnsavedChanges(dirty, tc("unsavedNavigationConfirm"));

  return (
    <form action={updatePhotoCredits} className="flex flex-col gap-2">
      <input type="hidden" name="photoId" value={photoId} />
      <input type="hidden" name="creditsJson" value={creditsJson} />
      {rows.map((row) => (
        <div
          key={row.key}
          className="flex flex-col gap-1 rounded-md border border-border-strong/40 p-1.5"
        >
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <label className="flex min-w-0 flex-col gap-1 text-xs text-fg-subtle">
              {t("creditName", { term: creditTerm })}
              <input
                value={row.creditName}
                onChange={(e) => updateRow(row.key, { creditName: e.target.value })}
                onBlur={(e) => syncLinksToName(row.key, e.target.value)}
                maxLength={200}
                list="known-credits"
                className={smallInputCls}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-xs text-fg-subtle">
              {subjectTerm}
              <input
                value={row.subject}
                onChange={(e) => updateRow(row.key, { subject: e.target.value })}
                maxLength={200}
                className={smallInputCls}
              />
            </label>
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
      <label className="flex min-w-0 flex-col gap-1 text-xs text-fg-subtle">
        {t("photoComment")}
        <textarea
          name="comment"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          maxLength={2000}
          rows={2}
          placeholder={t("photoCommentPlaceholder")}
          className={`${smallInputCls} min-h-16 resize-y`}
        />
      </label>
      <button
        type="submit"
        disabled={!dirty}
        className={`${btnCls} self-start`}
      >
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
  const [dirty, setDirty] = useState(false);
  const [state, action, pending] = useActionState<
    PhotoExifFormState,
    FormData
  >(updatePhotoExif, {});
  useUnsavedChanges(dirty, tc("unsavedNavigationConfirm"));

  useEffect(() => {
    if (state.status === "saved") setDirty(false);
  }, [state]);

  return (
    <form
      action={action}
      onChange={() => setDirty(true)}
      aria-busy={pending}
      className="flex flex-col gap-1 rounded-md border border-border-strong/40 p-1.5"
    >
      <input type="hidden" name="photoId" value={photoId} />
      <div className="grid gap-2 sm:grid-cols-2">
        {[
          ["exifCameraModel", "exifCameraModel", initial.cameraModel, undefined],
          ["exifLensModel", "exifLensModel", initial.lensModel, undefined],
          ["exifFocalLengthMm", "exifFocalLength", initial.focalLengthMm, "decimal"],
          ["exifAperture", "exifAperture", initial.aperture, "decimal"],
          ["exifExposureTime", "exifExposureTime", initial.exposureTime, undefined],
          ["exifIso", "exifIso", initial.iso, "numeric"]
        ].map(([name, label, value, inputMode]) => (
          <label key={name} className="flex min-w-0 flex-col gap-1 text-xs text-fg-subtle">
            {t(label as Parameters<typeof t>[0])}
            <input
              name={name}
              defaultValue={value}
              inputMode={inputMode as "decimal" | "numeric" | undefined}
              maxLength={200}
              className={smallInputCls}
            />
          </label>
        ))}
        <label className="flex min-w-0 flex-col gap-1 text-xs text-fg-subtle">
          {t("exifTakenAt")}
          <input
            name="exifTakenAt"
            type="date"
            defaultValue={initial.takenAt}
            className={smallInputCls}
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={pending || !dirty}
        className={`${buttonClasses({
          variant: dirty ? "primary" : "secondary",
          size: "compact"
        })} mt-2 self-start`}
      >
        {tc("save")}
      </button>
      {state.status === "saved" && !dirty && (
        <p role="status" className="text-xs font-medium text-success">
          {tc("saved")}
        </p>
      )}
      {state.status === "error" && (
        <p role="alert" className="text-xs font-medium text-danger">
          {tc("error")}
        </p>
      )}
    </form>
  );
}

function HomeWeightForm({
  photoId,
  initialWeight
}: {
  photoId: string;
  initialWeight: number;
}) {
  const t = useTranslations("adminEvents");
  const tc = useTranslations("common");
  const [state, action, pending] = useActionState<
    HomeWeightFormState,
    FormData
  >(updateHomeWeight, { status: "idle" });
  const [weight, setWeight] = useState(initialWeight);
  const [savedWeight, setSavedWeight] = useState(initialWeight);
  const dirty = weight !== savedWeight;
  useUnsavedChanges(dirty, tc("unsavedNavigationConfirm"));

  useEffect(() => {
    setWeight(initialWeight);
    setSavedWeight(initialWeight);
  }, [initialWeight]);

  useEffect(() => {
    if (state.status !== "saved") return;
    setWeight(state.weight);
    setSavedWeight(state.weight);
  }, [state]);

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="photoId" value={photoId} />
      <label className="flex flex-col gap-1 text-xs text-fg-muted">
        <span className="font-semibold text-fg">{t("homeWeightLabel")}</span>
        <select
          name="homeWeight"
          value={weight}
          disabled={pending}
          onChange={(event) => setWeight(Number(event.target.value))}
          className={smallInputCls}
        >
          {[1, 2, 3, 4, 5].map((optionWeight) => (
            <option key={optionWeight} value={optionWeight}>
              {optionWeight === 1
                ? t("homeWeightSmallest", { weight: optionWeight })
                : optionWeight === 5
                  ? t("homeWeightLargest", { weight: optionWeight })
                  : t("homeWeightOption", { weight: optionWeight })}
            </option>
          ))}
        </select>
        <span className="text-fg-subtle">{t("homeWeightHint")}</span>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pending || !dirty}
          data-dirty={dirty ? "true" : "false"}
          className={buttonClasses({
            variant: dirty ? "primary" : "secondary",
            size: "compact"
          })}
        >
          {t("saveHomeWeight")}
        </button>
        {state.status === "saved" && !dirty && (
          <span role="status" className="text-xs text-success">
            {tc("saved")}
          </span>
        )}
        {state.status === "error" && (
          <span role="alert" className="text-xs text-danger">
            {tc("error")}
          </span>
        )}
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
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-raised p-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-fg-muted">
            {t("bulkFilterLabel", { term: creditTerm })}
          </span>
          <select
            value={filterName}
            onChange={(e) => onFilterChange(e.target.value)}
            className="rounded-md border border-border-strong bg-control px-2 py-1 text-sm text-fg outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
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
  const router = useRouter();

  const [filterName, setFilterName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pollExpired, setPollExpired] = useState(false);
  const moderationWorking = photos.some(
    (photo) =>
      photo.moderationStatus === "queued" ||
      photo.moderationStatus === "processing"
  );
  const moderationLabels: Record<ImageModerationCategory, string> = {
    "self-harm": t("moderationCategorySelfHarm"),
    "self-harm/intent": t("moderationCategorySelfHarmIntent"),
    "self-harm/instructions": t("moderationCategorySelfHarmInstructions"),
    sexual: t("moderationCategorySexual"),
    violence: t("moderationCategoryViolence"),
    "violence/graphic": t("moderationCategoryViolenceGraphic")
  };

  useEffect(() => {
    if (!moderationWorking) {
      setPollExpired(false);
      return;
    }
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      if (Date.now() - startedAt >= 120_000) {
        window.clearInterval(interval);
        setPollExpired(true);
        return;
      }
      router.refresh();
    }, 3_000);
    return () => window.clearInterval(interval);
  }, [moderationWorking, router]);

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
      {moderationWorking && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-raised p-3 text-sm text-fg-muted"
        >
          <span>{t("moderationScreeningBatch")}</span>
          {pollExpired && (
            <button
              type="button"
              onClick={() => {
                setPollExpired(false);
                router.refresh();
              }}
              className={btnCls}
            >
              {t("moderationRefresh")}
            </button>
          )}
        </div>
      )}
      <datalist id="known-credits">
        {creditProfiles.map((profile) => (
          <option key={profile.creditName} value={profile.creditName} />
        ))}
      </datalist>

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
            className="flex flex-col gap-2 rounded-xl border border-border bg-raised p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <span aria-hidden="true" className="font-meta text-[0.6875rem] tracking-[0.16em] text-accent">
                {String(i + 1).padStart(2, "0")}
              </span>
              <label className="flex items-center gap-2 text-xs text-fg-muted">
              <input
                type="checkbox"
                checked={selected.has(photo.id)}
                onChange={() => toggleSelected(photo.id)}
                className="h-4 w-4 accent-accent"
              />
              {t("bulkSelectPhotoLabel")}
              </label>
            </div>

            <div className="ui-image-frame relative overflow-hidden rounded-lg bg-control">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.thumbUrl}
                alt=""
                loading="lazy"
                className="aspect-[4/3] w-full object-cover"
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
              {(photo.moderationStatus === "queued" ||
                photo.moderationStatus === "processing") && (
                <span className="absolute bottom-2 left-2 rounded-md bg-neutral-900/85 px-2 py-1 text-xs font-semibold text-white">
                  {t("moderationScreening")}
                </span>
              )}
            </div>

            {photo.moderationStatus === "review_required" && (
              <div
                role="alert"
                className="rounded-lg border border-warning-border bg-warning-surface p-3 text-sm text-fg"
              >
                <p className="font-semibold">{t("moderationReviewWarning")}</p>
                <p className="mt-1 text-xs">
                  {photo.moderationCategories.length > 0
                    ? t("moderationReviewCategories", {
                        categories: photo.moderationCategories
                          .map((category) => moderationLabels[category])
                          .join(", ")
                      })
                    : t("moderationReviewReasonUnavailable")}
                </p>
              </div>
            )}
            {photo.moderationStatus === "error" && (
              <p
                role="alert"
                className="rounded-lg border border-danger-border bg-danger-surface p-3 text-sm text-danger"
              >
                {t("moderationErrorWarning")}
              </p>
            )}
            {photo.moderationStatus === "rejected" && (
              <p
                role="alert"
                className="rounded-lg border border-danger-border bg-danger-surface p-3 text-sm text-danger"
              >
                {t("moderationRejectedWarning")}
              </p>
            )}

            <PhotoCardSection
              title={t("photoSectionAttribution", { term: creditTerm })}
              summary={[
                photo.credits.length > 0
                  ? t("photoCreditCount", { count: photo.credits.length })
                  : t("photoNoCredits"),
                photo.comment ? t("photoCommentAdded") : null
              ]
                .filter(Boolean)
                .join(" · ")}
            >
              <CreditsForm
                photoId={photo.id}
                initial={photo.credits}
                initialComment={photo.comment}
                creditProfiles={creditProfiles}
                creditTerm={creditTerm}
                subjectTerm={subjectTerm}
              />
            </PhotoCardSection>

            <PhotoCardSection
              title={t("photoSectionDisplay")}
              summary={[
                t("homeWeightOption", { weight: photo.homeWeight }),
                photo.isCover ? t("cover") : null,
                photo.homeHighlight ? t("homeHighlight") : null
              ]
                .filter(Boolean)
                .join(" · ")}
            >
              <HomeWeightForm
                photoId={photo.id}
                initialWeight={photo.homeWeight}
              />

              <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
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
                {moderationAllowsPublicPhoto(photo.moderationStatus) &&
                  !photo.isCover && (
                    <form action={setCoverPhoto}>
                      <input type="hidden" name="photoId" value={photo.id} />
                      <button type="submit" className={btnCls}>
                        {t("setCover")}
                      </button>
                    </form>
                  )}
                {moderationAllowsPublicPhoto(photo.moderationStatus) && (
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
                )}
              </div>
            </PhotoCardSection>

            <PhotoCardSection
              title={t("photoSectionTechnical")}
              summary={
                photo.exif.cameraModel ||
                photo.exif.lensModel ||
                t("photoSectionTechnicalEmpty")
              }
            >
              <ExifForm photoId={photo.id} initial={photo.exif} />
            </PhotoCardSection>

            <div className="flex justify-end border-t border-border pt-2">
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
