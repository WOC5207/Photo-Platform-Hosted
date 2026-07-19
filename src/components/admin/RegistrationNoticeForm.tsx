"use client";

import { useActionState, useEffect, useState } from "react";
import {
  saveRegistrationNotice,
  type RegistrationNoticeState
} from "@/app/[locale]/admin/(protected)/actions";
import type { PlatformSettings } from "@/lib/platformSettings";
import Button from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Field";
import StatusMessage from "@/components/ui/StatusMessage";

interface Labels {
  title: string;
  description: string;
  enabled: string;
  enabledHint: string;
  mode: string;
  informationMode: string;
  consentMode: string;
  consentModeHint: string;
  delay: string;
  delayHint: string;
  titleEn: string;
  titleZh: string;
  bodyEn: string;
  bodyZh: string;
  bodyHint: string;
  save: string;
  saved: string;
  error: string;
}

export default function RegistrationNoticeForm({
  settings,
  labels
}: {
  settings: PlatformSettings;
  labels: Labels;
}) {
  const [state, action, pending] = useActionState<RegistrationNoticeState, FormData>(
    saveRegistrationNotice,
    {}
  );
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (state.ok) setDirty(false);
  }, [state]);

  return (
    <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
      <div>
        <h2 className="text-lg font-semibold">{labels.title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-fg-subtle">
          {labels.description}
        </p>
      </div>

      <form
        action={action}
        onChange={() => setDirty(true)}
        className="mt-5 flex flex-col gap-5"
      >
        <label className="flex items-start gap-3 rounded-lg border border-border p-3">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={settings.registrationNoticeEnabled}
            disabled={pending}
            className="mt-0.5 size-4 shrink-0 accent-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40"
          />
          <span className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-fg">{labels.enabled}</span>
            <span className="text-xs leading-relaxed text-fg-subtle">
              {labels.enabledHint}
            </span>
          </span>
        </label>

        <Field label={labels.mode} htmlFor="registration-notice-mode" hint={labels.consentModeHint}>
          <select
            id="registration-notice-mode"
            name="mode"
            defaultValue={settings.registrationNoticeMode}
            disabled={pending}
            className="min-h-10 rounded-lg border border-border-strong bg-page px-3 py-2 text-sm"
          >
            <option value="information">{labels.informationMode}</option>
            <option value="consent">{labels.consentMode}</option>
          </select>
        </Field>

        <Field label={labels.delay} htmlFor="registration-notice-delay" hint={labels.delayHint}>
          <Input
            id="registration-notice-delay"
            name="delaySeconds"
            type="number"
            min={0}
            max={300}
            step={1}
            required
            defaultValue={settings.registrationNoticeDelaySeconds}
            disabled={pending}
            className="max-w-40"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={labels.titleEn} htmlFor="registration-notice-title-en">
            <Input
              id="registration-notice-title-en"
              name="titleEn"
              maxLength={200}
              defaultValue={settings.registrationNoticeTitleEn}
              disabled={pending}
            />
          </Field>
          <Field label={labels.titleZh} htmlFor="registration-notice-title-zh">
            <Input
              id="registration-notice-title-zh"
              name="titleZh"
              maxLength={200}
              defaultValue={settings.registrationNoticeTitleZh}
              disabled={pending}
            />
          </Field>
          <Field
            label={labels.bodyEn}
            htmlFor="registration-notice-body-en"
            hint={labels.bodyHint}
          >
            <Textarea
              id="registration-notice-body-en"
              name="bodyEn"
              rows={9}
              maxLength={20_000}
              defaultValue={settings.registrationNoticeBodyEn}
              disabled={pending}
              className="resize-y leading-relaxed"
            />
          </Field>
          <Field
            label={labels.bodyZh}
            htmlFor="registration-notice-body-zh"
            hint={labels.bodyHint}
          >
            <Textarea
              id="registration-notice-body-zh"
              name="bodyZh"
              rows={9}
              maxLength={20_000}
              defaultValue={settings.registrationNoticeBodyZh}
              disabled={pending}
              className="resize-y leading-relaxed"
            />
          </Field>
        </div>

        {state.error && <StatusMessage kind="error">{labels.error}</StatusMessage>}
        {state.ok && !dirty && <StatusMessage kind="success">{labels.saved}</StatusMessage>}

        <div className="flex justify-end border-t border-border pt-4">
          <Button type="submit" variant="primary" disabled={pending || !dirty}>
            {labels.save}
          </Button>
        </div>
      </form>
    </section>
  );
}
