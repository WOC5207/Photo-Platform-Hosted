"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import SocialLinksEditor, {
  emptySocialLink,
  type SocialLinkValue
} from "./SocialLinksEditor";

export interface CreditProfile {
  creditName: string;
  socialLinks: { platform: string; url: string }[];
}

type UploadStatus = {
  total: number;
  done: number;
  failed: string[];
  /** Set when the batch stopped early because the quota ran out. */
  quotaExceeded?: boolean;
};
type Mode = "single" | "multiple";
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

let rowKeySeq = 0;
function emptyRow(): Row {
  return {
    key: rowKeySeq++,
    creditName: "",
    subject: "",
    socialLinks: [],
    linksSourceName: ""
  };
}

const inputCls =
  "min-h-10 min-w-0 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg outline-none focus-visible:border-fg-subtle focus-visible:ring-2 focus-visible:ring-fg/20";
const modeBtnCls = (active: boolean) =>
  `inline-flex min-h-10 items-center justify-center rounded-lg px-3 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40 max-sm:min-h-11 ${
    active
      ? "bg-fg text-page"
      : "border border-border-strong text-fg-muted hover:border-fg-faint hover:text-fg"
  }`;
const btnCls =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-border-strong px-3 py-2 text-xs font-semibold text-fg-muted transition hover:border-fg-faint hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40 disabled:opacity-40 max-sm:min-h-11";

export default function PhotoUploader({
  eventId,
  creditProfiles,
  creditTerm,
  subjectTerm
}: {
  eventId: string;
  creditProfiles: CreditProfile[];
  creditTerm: string;
  subjectTerm: string;
}) {
  const t = useTranslations("adminEvents");
  const tc = useTranslations("common");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<Mode>("single");
  const [rows, setRows] = useState<Row[]>(() => [emptyRow()]);
  const [status, setStatus] = useState<UploadStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const credits = rows
    .map((r) => ({
      creditName: r.creditName.trim(),
      subject: r.subject.trim(),
      socialLinks: r.socialLinks
        .map((s) => ({ platform: s.platform, url: s.url.trim() }))
        .filter((s) => s.url.length > 0)
    }))
    .filter((r) => r.creditName.length > 0);

  const canCreate = !busy && files.length > 0 && credits.length > 0;

  function switchMode(next: Mode) {
    setMode(next);
    setRows((rs) => {
      if (next === "single") return rs.length > 0 ? [rs[0]] : [emptyRow()];
      if (rs.length < 2) return [...rs, ...Array.from({ length: 2 - rs.length }, emptyRow)];
      return rs;
    });
  }

  function updateRow(key: number, patch: Partial<Row>) {
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

  async function handleCreate() {
    if (!canCreate) return;
    setBusy(true);
    const failed: string[] = [];
    const total = files.length;
    setStatus({ total, done: 0, failed });

    // One at a time: keeps sharp's memory use low on the NAS.
    let quotaExceeded = false;
    for (let i = 0; i < total; i++) {
      const file = files[i];
      try {
        const body = new FormData();
        body.append("eventId", eventId);
        body.append("file", file);
        body.append("credits", JSON.stringify(credits));
        const res = await fetch("/api/admin/photos", { method: "POST", body });
        if (!res.ok) {
          failed.push(file.name);
          const data = await res.json().catch(() => null);
          if (data?.error === "quotaExceeded") {
            // Stop the batch. Every remaining file would fail the same way, and
            // grinding through fifty of them to say so is just slow and
            // confusing — the user needs to free space, not watch a progress
            // bar fill with errors.
            quotaExceeded = true;
            setStatus({ total, done: i + 1, failed: [...failed], quotaExceeded });
            break;
          }
        }
      } catch {
        failed.push(file.name);
      }
      setStatus({ total, done: i + 1, failed: [...failed], quotaExceeded });
    }

    setBusy(false);
    setFiles([]);
    if (inputRef.current) inputRef.current.value = "";
    setRows(mode === "single" ? [emptyRow()] : [emptyRow(), emptyRow()]);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border-strong p-4">
      <datalist id="known-credits">
        {creditProfiles.map((c) => (
          <option key={c.creditName} value={c.creditName} />
        ))}
      </datalist>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-h-11 w-fit cursor-pointer items-center gap-2 rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-fg-muted transition hover:border-fg-subtle hover:text-fg focus-within:ring-2 focus-within:ring-fg/40">
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className="sr-only"
          />
          <span>+ {t("upload")}</span>
        </label>
        <span className="text-sm text-fg-subtle">
          {files.length > 0
            ? t("filesSelected", { count: files.length })
            : t("noFilesSelected")}
        </span>
      </div>
      <p className="-mt-1 text-xs text-fg-subtle">{t("uploadHint")}</p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-pressed={mode === "single"}
          onClick={() => switchMode("single")}
          className={modeBtnCls(mode === "single")}
        >
          {t("singleCreditMode")}
        </button>
        <button
          type="button"
          aria-pressed={mode === "multiple"}
          onClick={() => switchMode("multiple")}
          className={modeBtnCls(mode === "multiple")}
        >
          {t("multipleCreditsMode")}
        </button>
      </div>

      <div className="flex flex-col gap-2">
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
                  onChange={(e) => updateRow(row.key, { creditName: e.target.value })}
                  onBlur={(e) => syncLinksToName(row.key, e.target.value)}
                  maxLength={200}
                  list="known-credits"
                  className={inputCls}
                />
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-xs text-fg-subtle">
                {subjectTerm}
                <input
                  value={row.subject}
                  onChange={(e) => updateRow(row.key, { subject: e.target.value })}
                  maxLength={200}
                  className={inputCls}
                />
              </label>
              {mode === "multiple" && rows.length > 1 && (
                <button
                  type="button"
                  aria-label={t("removeCreditAria", { term: creditTerm })}
                  onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}
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
        {mode === "multiple" && (
          <button
            type="button"
            onClick={() => setRows((rs) => [...rs, emptyRow()])}
            className={`${btnCls} self-start`}
          >
            + {t("addCredit", { term: creditTerm })}
          </button>
        )}
      </div>
      <p className="-mt-1 text-xs text-fg-subtle">{t("batchCreditHint")}</p>

      <button
        type="button"
        disabled={!canCreate}
        onClick={handleCreate}
        className="self-start rounded-lg bg-fg px-5 py-2 text-sm font-semibold text-page transition hover:opacity-90 disabled:opacity-40"
      >
        {busy ? "…" : tc("create")}
      </button>

      {status && (
        <div role="status" aria-live="polite" className="text-sm">
          <p className="text-fg-muted">
            {status.quotaExceeded
              ? t("uploadStopped", { done: status.done, total: status.total })
              : status.done < status.total
                ? t("uploading", { done: status.done, total: status.total })
                : t("uploadDone")}
          </p>
          {status.quotaExceeded && (
            <p className="mt-1 font-medium text-danger">{t("uploadQuotaExceeded")}</p>
          )}
          {status.failed.map((name) => (
            <p key={name} className="text-danger">
              {t("uploadFailedFile", { name })}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
