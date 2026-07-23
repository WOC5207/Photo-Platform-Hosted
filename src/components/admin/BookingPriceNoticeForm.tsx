"use client";

import { useActionState, useEffect, useState } from "react";
import {
  saveBookingPriceNotice,
  type BookingPriceNoticeState
} from "@/app/[locale]/admin/(protected)/actions";
import type { PlatformSettings } from "@/lib/platformSettings";
import Button from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Field";
import StatusMessage from "@/components/ui/StatusMessage";
import { useTranslations } from "next-intl";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";

interface Labels {
  title: string;
  description: string;
  titleEn: string;
  titleZh: string;
  bodyEn: string;
  bodyZh: string;
  bodyHint: string;
  save: string;
  saved: string;
  error: string;
}

export default function BookingPriceNoticeForm({
  settings,
  labels
}: {
  settings: PlatformSettings;
  labels: Labels;
}) {
  const tc = useTranslations("common");
  const [state, action, pending] = useActionState<
    BookingPriceNoticeState,
    FormData
  >(saveBookingPriceNotice, {});
  const [dirty, setDirty] = useState(false);
  useUnsavedChanges(dirty, tc("unsavedNavigationConfirm"));

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
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={labels.titleEn} htmlFor="booking-price-notice-title-en">
            <Input
              id="booking-price-notice-title-en"
              name="titleEn"
              maxLength={200}
              defaultValue={settings.bookingPriceNoticeTitleEn}
              disabled={pending}
            />
          </Field>
          <Field label={labels.titleZh} htmlFor="booking-price-notice-title-zh">
            <Input
              id="booking-price-notice-title-zh"
              name="titleZh"
              maxLength={200}
              defaultValue={settings.bookingPriceNoticeTitleZh}
              disabled={pending}
            />
          </Field>
          <Field
            label={labels.bodyEn}
            htmlFor="booking-price-notice-body-en"
            hint={labels.bodyHint}
          >
            <Textarea
              id="booking-price-notice-body-en"
              name="bodyEn"
              rows={7}
              maxLength={20_000}
              defaultValue={settings.bookingPriceNoticeBodyEn}
              disabled={pending}
              className="resize-y leading-relaxed"
            />
          </Field>
          <Field
            label={labels.bodyZh}
            htmlFor="booking-price-notice-body-zh"
            hint={labels.bodyHint}
          >
            <Textarea
              id="booking-price-notice-body-zh"
              name="bodyZh"
              rows={7}
              maxLength={20_000}
              defaultValue={settings.bookingPriceNoticeBodyZh}
              disabled={pending}
              className="resize-y leading-relaxed"
            />
          </Field>
        </div>

        {state.error && <StatusMessage kind="error">{labels.error}</StatusMessage>}
        {state.ok && !dirty && (
          <StatusMessage kind="success">{labels.saved}</StatusMessage>
        )}

        <div className="flex justify-end border-t border-border pt-4">
          <Button type="submit" variant="primary" disabled={pending || !dirty}>
            {labels.save}
          </Button>
        </div>
      </form>
    </section>
  );
}
