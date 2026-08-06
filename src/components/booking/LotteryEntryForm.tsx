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
import Button from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import StatusMessage from "@/components/ui/StatusMessage";

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
  return <StatusMessage kind="error">{t(key)}</StatusMessage>;
}

function ContactFields() {
  const t = useTranslations("lotteryEntry");
  return (
    <>
      <Field label={t("name")} htmlFor="lottery-entry-name" required>
        <Input
          id="lottery-entry-name"
          name="name"
          required
          maxLength={200}
          autoComplete="name"
        />
      </Field>
      <Field
        label={t("contactValue")}
        htmlFor="lottery-entry-contact"
        hint={t("contactHint")}
        required
      >
        <Input
          id="lottery-entry-contact"
          name="contactValue"
          required
          maxLength={200}
        />
      </Field>
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
              <Button
                type="button"
                onClick={copyActiveToken}
                variant="secondary"
                className="border-success-border bg-page/70 text-success-strong"
              >
                {tokenCopied ? t("copied") : t("copyToken")}
              </Button>
            </span>
          </div>
        </div>
        <PublicLotteryDraw drawToken={drawToken} entry={activeEntry} prizes={prizes} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <form action={entryAction} aria-busy={entryPending} className="flex flex-col gap-4">
        <input type="hidden" name="drawToken" value={drawToken} />
        <ContactFields />
        <ErrorMessage state={entryState} />
        <Button type="submit" variant="primary" disabled={entryPending}>
          {t("submit")}
        </Button>
      </form>

      <details className="rounded-xl border border-border bg-surface p-4">
        <summary className="cursor-pointer text-sm font-semibold">{t("recoveryTitle")}</summary>
        <form action={recoveryAction} aria-busy={recoveryPending} className="mt-4 flex flex-col gap-4">
          <input type="hidden" name="drawToken" value={drawToken} />
          <p className="text-sm text-fg-subtle">{t("recoveryHint")}</p>
          <Field label={t("yourToken")} htmlFor="lottery-recovery-token" required>
            <Input
              id="lottery-recovery-token"
              name="entryToken"
              required
              minLength={5}
              maxLength={12}
              className="font-meta uppercase"
            />
          </Field>
          <ContactFields />
          <ErrorMessage state={recoveryState} />
          <Button type="submit" variant="secondary" disabled={recoveryPending}>
            {t("recoverySubmit")}
          </Button>
        </form>
      </details>
    </div>
  );
}
