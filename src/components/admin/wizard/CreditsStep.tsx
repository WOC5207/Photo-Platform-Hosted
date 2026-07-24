"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { formatCredits } from "@/lib/content";
import SocialLinksEditor, {
  emptySocialLink,
  type SocialLinkValue
} from "../SocialLinksEditor";
import type {
  AssignedCredit,
  CreditProfile,
  PendingUploadQueue
} from "./usePendingUploadQueue";
import SelectableGrid from "./SelectableGrid";
import { btnCls, inputCls, primaryBtnCls } from "./ui";

let rowKeySeq = 0;

interface Row {
  key: number;
  creditName: string;
  subject: string;
  socialLinks: SocialLinkValue[];
  // The name this row's social links currently reflect (from a profile
  // match, or "" if cleared/no match) — lets us tell when the name has moved
  // on to a different person and the links need to follow, instead of
  // lingering from whoever was typed before.
  linksSourceName: string;
}

function emptyRow(): Row {
  return {
    key: rowKeySeq++,
    creditName: "",
    subject: "",
    socialLinks: [],
    linksSourceName: ""
  };
}

export default function CreditsStep({
  queue,
  creditsByPhoto,
  onAssign,
  commentByPhoto,
  onAssignComment,
  creditProfiles,
  creditTerm,
  subjectTerm,
  ackUncredited,
  onAckUncredited
}: {
  queue: PendingUploadQueue;
  creditsByPhoto: Record<string, AssignedCredit[]>;
  onAssign: (photoIds: string[], credits: AssignedCredit[]) => void;
  commentByPhoto: Record<string, string>;
  onAssignComment: (photoIds: string[], comment: string) => void;
  creditProfiles: CreditProfile[];
  creditTerm: string;
  subjectTerm: string;
  ackUncredited: boolean;
  onAckUncredited: (acknowledged: boolean) => void;
}) {
  const t = useTranslations("adminEvents");
  const tw = useTranslations("photoWizard");

  const photos = queue.browsableFiles;
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(photos.map((item) => item.photoId))
  );
  const [rows, setRows] = useState<Row[]>(() => [emptyRow()]);
  const [comment, setComment] = useState("");

  const busy = queue.locked || queue.clearing;
  const uncreditedCount = photos.filter(
    (item) => (creditsByPhoto[item.photoId] ?? []).length === 0
  ).length;
  const selectedIds = photos
    .map((item) => item.photoId)
    .filter((photoId) => selected.has(photoId));

  const credits: AssignedCredit[] = rows
    .map((row) => ({
      creditName: row.creditName.trim(),
      subject: row.subject.trim(),
      socialLinks: row.socialLinks
        .map((link) => ({ platform: link.platform, url: link.url.trim() }))
        .filter((link) => link.url.length > 0)
    }))
    .filter((row) => row.creditName.length > 0);

  function toggle(photoId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  }

  function updateRow(key: number, patch: Partial<Row>) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row))
    );
  }

  // Keep social links synchronized with the remembered profile for the name
  // currently typed in a credit row.
  function syncLinksToName(key: number, typedName: string) {
    const name = typedName.trim();
    setRows((current) =>
      current.map((row) => {
        if (row.key !== key || name === row.linksSourceName) return row;
        const profile = creditProfiles.find(
          (candidate) => candidate.creditName === name
        );
        return {
          ...row,
          linksSourceName: name,
          socialLinks: profile
            ? profile.socialLinks.map((link) => emptySocialLink(link))
            : []
        };
      })
    );
  }

  function selectUncredited() {
    setSelected(
      new Set(
        photos
          .map((item) => item.photoId)
          .filter((photoId) => (creditsByPhoto[photoId] ?? []).length === 0)
      )
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-fg-muted">{tw("creditsIntro", { term: creditTerm })}</p>

      {uncreditedCount > 0 && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-lg border border-danger-border bg-danger-surface/40 p-3 text-sm"
        >
          <p className="font-medium text-danger-strong">
            {tw("uncreditedWarning", { count: uncreditedCount })}
          </p>
          <label className="flex items-center gap-2 text-fg">
            <input
              type="checkbox"
              checked={ackUncredited}
              disabled={busy}
              onChange={(event) => onAckUncredited(event.target.checked)}
              className="h-4 w-4"
            />
            {tw("uncreditedAck")}
          </label>
        </div>
      )}

      <section
        aria-labelledby="credit-details-heading"
        className="flex flex-col gap-2 rounded-lg border border-border-strong/60 bg-surface/50 p-3"
      >
        <div>
          <h3 id="credit-details-heading" className="text-sm font-semibold text-fg">
            {tw("creditsDetailsTitle", { term: creditTerm })}
          </h3>
          <p className="mt-1 text-xs text-fg-subtle">
            {tw("creditsDetailsHint")}
          </p>
        </div>
        {rows.map((row) => (
          <div
            key={row.key}
            className="flex flex-col gap-2 rounded-lg border border-border-strong/50 p-2"
          >
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
              <label className="flex min-w-0 flex-col gap-1 text-xs text-fg-subtle">
                {t("creditName", { term: creditTerm })}
                <input
                  value={row.creditName}
                  onChange={(event) =>
                    updateRow(row.key, { creditName: event.target.value })
                  }
                  onBlur={(event) => syncLinksToName(row.key, event.target.value)}
                  maxLength={200}
                  list="known-credits"
                  className={inputCls}
                />
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-xs text-fg-subtle">
                {subjectTerm}
                <input
                  value={row.subject}
                  onChange={(event) =>
                    updateRow(row.key, { subject: event.target.value })
                  }
                  maxLength={200}
                  className={inputCls}
                />
              </label>
              {rows.length > 1 && (
                <button
                  type="button"
                  aria-label={t("removeCreditAria", { term: creditTerm })}
                  onClick={() =>
                    setRows((current) =>
                      current.filter((candidate) => candidate.key !== row.key)
                    )
                  }
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
          onClick={() => setRows((current) => [...current, emptyRow()])}
          className={`${btnCls} self-start`}
        >
          + {t("addCredit", { term: creditTerm })}
        </button>

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <button
            type="button"
            disabled={busy || credits.length === 0 || selectedIds.length === 0}
            onClick={() => onAssign(selectedIds, credits)}
            className={primaryBtnCls}
          >
            {tw("applyToSelected", { count: selectedIds.length })}
          </button>
          <button
            type="button"
            disabled={busy || selectedIds.length === 0}
            onClick={() => onAssign(selectedIds, [])}
            className={btnCls}
          >
            {tw("clearCreditsSelected", { count: selectedIds.length })}
          </button>
        </div>
      </section>

      <details className="group rounded-lg border border-border-strong/60 bg-surface/50">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-fg/30">
          <span>{tw("optionalCommentTitle")}</span>
          <span aria-hidden="true" className="text-fg-subtle">
            +
          </span>
        </summary>
        <div className="flex flex-col gap-2 border-t border-border p-3">
          <label className="flex flex-col gap-1 text-xs text-fg-subtle">
            {tw("commentLabel")}
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              maxLength={2000}
              rows={2}
              placeholder={tw("commentPlaceholder")}
              className={`${inputCls} min-h-16 resize-y`}
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={
                busy ||
                comment.trim().length === 0 ||
                selectedIds.length === 0
              }
              onClick={() => onAssignComment(selectedIds, comment)}
              className={btnCls}
            >
              {tw("applyCommentSelected", { count: selectedIds.length })}
            </button>
            <button
              type="button"
              disabled={busy || selectedIds.length === 0}
              onClick={() => onAssignComment(selectedIds, "")}
              className={btnCls}
            >
              {tw("clearCommentSelected", { count: selectedIds.length })}
            </button>
          </div>
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-2 text-xs text-fg-subtle">
        <button
          type="button"
          disabled={busy}
          onClick={() => setSelected(new Set(photos.map((item) => item.photoId)))}
          className={`${btnCls} min-h-8 px-2 py-1`}
        >
          {t("bulkSelectAllVisible")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={selectUncredited}
          className={`${btnCls} min-h-8 px-2 py-1`}
        >
          {tw("selectUncredited")}
        </button>
        <button
          type="button"
          disabled={busy || selected.size === 0}
          onClick={() => setSelected(new Set())}
          className={`${btnCls} min-h-8 px-2 py-1`}
        >
          {t("bulkClearSelection")}
        </button>
        <span role="status">{t("bulkSelectedCount", { count: selected.size })}</span>
      </div>

      <p className="flex items-center gap-2 text-xs text-fg-subtle">
        <span
          aria-hidden="true"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-danger-border bg-danger-surface text-[11px] font-bold text-danger-strong"
        >
          !
        </span>
        {tw("noCreditLegend")}
      </p>

      <SelectableGrid
        photos={photos}
        selected={selected}
        onToggle={toggle}
        disabled={busy}
        renderBadge={(photo) =>
          (creditsByPhoto[photo.photoId] ?? []).length === 0 ? (
            <span
              title={tw("noCreditBadge")}
              className="flex h-6 w-6 items-center justify-center rounded-full border border-danger-border bg-danger-surface text-xs font-bold text-danger-strong shadow-sm"
            >
              !
            </span>
          ) : null
        }
        renderFooter={(photo) => {
          const assigned = creditsByPhoto[photo.photoId] ?? [];
          const photoComment = commentByPhoto[photo.photoId] ?? "";
          return (
            <div className="flex flex-col gap-0.5">
              {assigned.length > 0 ? (
                <span
                  className="truncate text-xs font-medium text-fg"
                  title={formatCredits(assigned)}
                >
                  {formatCredits(assigned)}
                </span>
              ) : (
                <span className="text-xs text-fg-subtle">{tw("noCreditBadge")}</span>
              )}
              {photoComment && (
                <span
                  className="line-clamp-2 text-xs text-fg-subtle"
                  title={photoComment}
                >
                  {photoComment}
                </span>
              )}
            </div>
          );
        }}
      />
    </div>
  );
}
