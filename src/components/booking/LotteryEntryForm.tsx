"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  recoverLotteryEntry,
  submitLotteryEntry,
  type LotteryEntryFormState,
  type VisitorLotteryEntry
} from "@/app/[locale]/(public)/draw/actions";
import PublicLotteryDraw, { type PublicLotteryPrize } from "./PublicLotteryDraw";

export interface PublicContactMethod {
  id: string;
  label: string;
}

const inputCls =
  "rounded-lg border border-border-strong bg-surface px-3 py-2 text-fg outline-none focus:border-fg-subtle";

function ErrorMessage({ state }: { state: LotteryEntryFormState }) {
  const t = useTranslations("lotteryEntry");
  if (!state.error) return null;
  const key = {
    validation: "errorValidation",
    rateLimited: "errorRateLimited",
    closed: "errorClosed",
    duplicate: "errorDuplicate",
    notFound: "recoveryNotFound"
  }[state.error];
  return (
    <p role="alert" className="rounded-lg bg-danger-surface px-3 py-2 text-sm text-danger">
      {t(key)}
    </p>
  );
}

function ContactFields({ contactMethods }: { contactMethods: PublicContactMethod[] }) {
  const t = useTranslations("lotteryEntry");
  return (
    <>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-fg-muted">{t("name")} *</span>
        <input name="name" required maxLength={200} className={inputCls} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-fg-muted">{t("contactMethod")} *</span>
          <select name="contactMethod" required defaultValue="" className={inputCls}>
            <option value="" disabled>{t("contactMethodPlaceholder")}</option>
            {contactMethods.map((method) => (
              <option key={method.id} value={method.label}>{method.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-fg-muted">{t("contactValue")} *</span>
          <input name="contactValue" required maxLength={200} className={inputCls} />
        </label>
      </div>
    </>
  );
}

export default function LotteryEntryForm({
  drawToken,
  contactMethods,
  initialEntry,
  prizes
}: {
  drawToken: string;
  contactMethods: PublicContactMethod[];
  initialEntry: VisitorLotteryEntry | null;
  prizes: PublicLotteryPrize[];
}) {
  const t = useTranslations("lotteryEntry");
  const [entryState, entryAction, entryPending] = useActionState<
    LotteryEntryFormState,
    FormData
  >(submitLotteryEntry, {});
  const [recoveryState, recoveryAction, recoveryPending] = useActionState<
    LotteryEntryFormState,
    FormData
  >(recoverLotteryEntry, {});
  const activeEntry = entryState.entry ?? recoveryState.entry ?? initialEntry;

  if (activeEntry) {
    return (
      <div className="flex flex-col gap-6">
        {(entryState.ok || recoveryState.ok) && (
          <div role="status" className="rounded-xl border border-success-border bg-success-surface p-6 text-center">
            <p className="text-sm text-success">{t("successNotice")}</p>
            <p className="mt-2 text-xs uppercase tracking-wide text-success">{t("yourToken")}</p>
            <p className="mt-1 font-mono text-2xl font-bold text-success-strong">
              {activeEntry.token}
            </p>
          </div>
        )}
        <PublicLotteryDraw drawToken={drawToken} entry={activeEntry} prizes={prizes} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <form action={entryAction} className="flex flex-col gap-4">
        <input type="hidden" name="drawToken" value={drawToken} />
        <ContactFields contactMethods={contactMethods} />
        <ErrorMessage state={entryState} />
        <button
          type="submit"
          disabled={entryPending}
          className="rounded-full bg-fg px-6 py-3 text-sm font-semibold text-page transition hover:opacity-90 disabled:opacity-50"
        >
          {t("submit")}
        </button>
      </form>

      <details className="rounded-xl border border-border bg-surface p-4">
        <summary className="cursor-pointer text-sm font-semibold">{t("recoveryTitle")}</summary>
        <form action={recoveryAction} className="mt-4 flex flex-col gap-4">
          <input type="hidden" name="drawToken" value={drawToken} />
          <p className="text-sm text-fg-subtle">{t("recoveryHint")}</p>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-fg-muted">{t("yourToken")} *</span>
            <input name="entryToken" required minLength={5} maxLength={12} className={inputCls} />
          </label>
          <ContactFields contactMethods={contactMethods} />
          <ErrorMessage state={recoveryState} />
          <button
            type="submit"
            disabled={recoveryPending}
            className="rounded-lg border border-border-strong px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {t("recoverySubmit")}
          </button>
        </form>
      </details>
    </div>
  );
}
