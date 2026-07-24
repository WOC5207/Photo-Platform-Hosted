"use client";

import { useActionState, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  recoverLotteryEntry,
  submitLotteryEntry,
  type LotteryEntryFormState,
  type VisitorLotteryEntry
} from "@/app/[locale]/(public)/draw/actions";
import PublicLotteryDraw, { type PublicLotteryPrize } from "./PublicLotteryDraw";

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

function ContactFields() {
  const t = useTranslations("lotteryEntry");
  return (
    <>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-fg-muted">{t("name")} *</span>
        <input name="name" required maxLength={200} className={inputCls} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-fg-muted">{t("contactValue")} *</span>
        <input name="contactValue" required maxLength={200} className={inputCls} />
        <span className="text-xs text-fg-subtle">{t("contactHint")}</span>
      </label>
    </>
  );
}

export default function LotteryEntryForm({
  drawToken,
  initialEntry,
  prizes
}: {
  drawToken: string;
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
  const tokenInputRef = useRef<HTMLInputElement>(null);
  const [tokenCopied, setTokenCopied] = useState(false);

  async function copyActiveToken() {
    if (!activeEntry) return;
    try {
      await navigator.clipboard.writeText(activeEntry.token);
      setTokenCopied(true);
    } catch {
      tokenInputRef.current?.focus();
      tokenInputRef.current?.select();
    }
  }

  if (activeEntry) {
    const justRecoveredOrEntered = Boolean(entryState.ok || recoveryState.ok);
    return (
      <div className="flex flex-col gap-6">
        <div
          role={justRecoveredOrEntered ? "status" : undefined}
          className="rounded-xl border border-success-border bg-success-surface p-6 text-center"
        >
          {justRecoveredOrEntered && (
            <p className="text-sm text-success">{t("successNotice")}</p>
          )}
          <div className="mt-2 text-xs uppercase tracking-wide text-success">
            <span>{t("yourToken")}</span>
            <span className="mx-auto mt-2 flex max-w-sm items-stretch gap-2">
              <input
                ref={tokenInputRef}
                readOnly
                value={activeEntry.token}
                aria-label={t("yourToken")}
                onFocus={(event) => event.currentTarget.select()}
                className="min-w-0 flex-1 rounded-lg border border-success-border bg-page/70 px-3 py-2 text-center font-mono text-xl font-bold normal-case tracking-normal text-success-strong outline-none focus-visible:ring-2 focus-visible:ring-success"
              />
              <button
                type="button"
                onClick={copyActiveToken}
                className="min-h-11 rounded-lg border border-success-border bg-page/70 px-3 py-2 text-sm font-semibold normal-case tracking-normal text-success-strong transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success"
              >
                {tokenCopied ? t("copied") : t("copyToken")}
              </button>
            </span>
          </div>
        </div>
        <PublicLotteryDraw drawToken={drawToken} entry={activeEntry} prizes={prizes} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <form action={entryAction} className="flex flex-col gap-4">
        <input type="hidden" name="drawToken" value={drawToken} />
        <ContactFields />
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
          <ContactFields />
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
