"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Button from "@/components/ui/Button";
import {
  sendNotification,
  type NotificationState
} from "@/app/[locale]/admin/(protected)/notifications/actions";

export interface NotificationAccount {
  id: string;
  username: string;
  displayName: string;
}

const inputCls =
  "min-h-10 min-w-0 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg outline-none focus-visible:border-fg-subtle focus-visible:ring-2 focus-visible:ring-fg/20";

/** Compose form: bilingual message + audience (everyone / selected accounts). */
export default function NotificationComposer({
  accounts
}: {
  accounts: NotificationAccount[];
}) {
  const t = useTranslations("adminNotifications");
  const formRef = useRef<HTMLFormElement>(null);
  const [audience, setAudience] = useState<"all" | "selected">("all");
  const [state, formAction, pending] = useActionState<NotificationState, FormData>(
    sendNotification,
    {}
  );

  // A successful send leaves a clean slate for the next message.
  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setAudience("all");
    }
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-4 rounded-xl border border-border-strong p-4"
    >
      <h2 className="text-lg font-semibold">{t("composeTitle")}</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-fg-muted">{t("titleEn")}</span>
          <input name="titleEn" maxLength={300} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-fg-muted">{t("titleZh")}</span>
          <input name="titleZh" maxLength={300} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-fg-muted">{t("bodyEn")}</span>
          <textarea name="bodyEn" rows={4} maxLength={5000} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-fg-muted">{t("bodyZh")}</span>
          <textarea name="bodyZh" rows={4} maxLength={5000} className={inputCls} />
        </label>
      </div>
      <p className="-mt-2 text-xs text-fg-subtle">{t("titleHint")}</p>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm text-fg-muted">{t("audienceLabel")}</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="audience"
            value="all"
            checked={audience === "all"}
            onChange={() => setAudience("all")}
            className="h-4 w-4 accent-fg"
          />
          {t("audienceAll")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="audience"
            value="selected"
            checked={audience === "selected"}
            onChange={() => setAudience("selected")}
            className="h-4 w-4 accent-fg"
          />
          {t("audienceSelected")}
        </label>
      </fieldset>

      {audience === "selected" && (
        <div className="max-h-64 overflow-y-auto rounded-lg border border-border-strong/60 p-3">
          <ul className="flex flex-col gap-1">
            {accounts.map((account) => (
              <li key={account.id}>
                <label className="flex min-h-9 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="targetIds"
                    value={account.id}
                    className="h-4 w-4 rounded accent-fg"
                  />
                  <span className="min-w-0 truncate">
                    {account.displayName || account.username}
                    <span className="ml-1 text-xs text-fg-subtle">
                      @{account.username}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.error && (
        <p role="alert" className="rounded-lg bg-danger-surface px-3 py-2 text-sm text-danger">
          {t("validationError")}
        </p>
      )}
      {state.ok && (
        <p role="status" className="rounded-lg bg-success-surface px-3 py-2 text-sm text-success">
          {t("sent")}
        </p>
      )}

      <Button type="submit" variant="primary" disabled={pending} className="self-start">
        {t("send")}
      </Button>
    </form>
  );
}
