"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type FormEvent
} from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import Button, { buttonClasses } from "@/components/ui/Button";
import StatusMessage from "@/components/ui/StatusMessage";
import BookingDayPicker from "@/components/admin/BookingDayPicker";
import type { BookingEventFormState } from "@/app/[locale]/dashboard/(protected)/bookings/actions";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";

export interface BookingEventFormValues {
  id?: string;
  titleEn: string;
  titleZh: string;
  dates: string[]; // yyyy-mm-dd, the days the event spans
  location: string;
  descriptionEn: string;
  descriptionZh: string;
  open: boolean;
}

const inputCls =
  "min-h-10 rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg outline-none transition focus-visible:border-fg-subtle focus-visible:ring-2 focus-visible:ring-fg/20";

export default function BookingEventForm({
  action,
  initial,
  submitLabel,
  showOpenToggle = true,
  cancelHref,
  timeZone,
  priceDisplay
}: {
  action: (
    prev: BookingEventFormState,
    formData: FormData
  ) => Promise<BookingEventFormState>;
  initial: BookingEventFormValues;
  submitLabel: string;
  showOpenToggle?: boolean;
  cancelHref: string;
  timeZone: string;
  priceDisplay?: {
    enabled: boolean;
    notice: {
      title: string;
      body: string;
      version: number;
    };
  };
}) {
  const t = useTranslations("adminBookings");
  const tc = useTranslations("common");
  const [state, formAction, pending] = useActionState<
    BookingEventFormState,
    FormData
  >(action, {});
  const [dirty, setDirty] = useState(false);
  const [priceNoticeOpen, setPriceNoticeOpen] = useState(false);
  const [priceNoticeAcknowledged, setPriceNoticeAcknowledged] = useState(false);
  const [priceEnableRequested, setPriceEnableRequested] = useState(false);
  const changeVersion = useRef(0);
  const submittedVersion = useRef(0);
  const markDirty = () => {
    changeVersion.current += 1;
    setDirty(true);
  };
  useUnsavedChanges(dirty, tc("unsavedNavigationConfirm"));

  useEffect(() => {
    if (state.ok && submittedVersion.current === changeVersion.current) {
      setDirty(false);
    }
    if (state.error === "priceNoticeRequired") {
      setPriceEnableRequested(false);
      setPriceNoticeAcknowledged(false);
      setPriceNoticeOpen(true);
    }
  }, [state]);

  function handleFormChange(event: FormEvent<HTMLFormElement>) {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      target.dataset.manualDirty === "true"
    ) {
      return;
    }
    markDirty();
  }

  const priceNoticeAvailable = Boolean(
    priceDisplay?.notice.title.trim() && priceDisplay.notice.body.trim()
  );

  return (
    <form
      action={formAction}
      onChange={handleFormChange}
      onSubmit={() => {
        submittedVersion.current = changeVersion.current;
      }}
      className="flex flex-col gap-4"
    >
      {initial.id && <input type="hidden" name="id" value={initial.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-fg-muted">{t("titleEn")}</span>
          <input
            name="titleEn"
            defaultValue={initial.titleEn}
            maxLength={300}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-fg-muted">{t("titleZh")}</span>
          <input
            name="titleZh"
            defaultValue={initial.titleZh}
            maxLength={300}
            className={inputCls}
          />
        </label>
      </div>
      <p className="-mt-2 text-xs text-fg-subtle">{t("titleHint")}</p>

      <BookingDayPicker
        initialDates={initial.dates}
        timeZone={timeZone}
        onSelectionChange={markDirty}
      />
      <p className="-mt-2 text-xs text-fg-subtle">
        {t("timeZoneNotice", { timeZone })}
      </p>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-fg-muted">{t("location")}</span>
        <input
          name="location"
          defaultValue={initial.location}
          maxLength={300}
          className={inputCls}
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-fg-muted">{t("descriptionEn")}</span>
          <textarea
            name="descriptionEn"
            defaultValue={initial.descriptionEn}
            rows={3}
            maxLength={5000}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-fg-muted">{t("descriptionZh")}</span>
          <textarea
            name="descriptionZh"
            defaultValue={initial.descriptionZh}
            rows={3}
            maxLength={5000}
            className={inputCls}
          />
        </label>
      </div>

      {priceDisplay && (
        <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-5 w-1 rounded-full bg-accent"
                />
                <h2 className="font-display text-lg font-semibold text-fg">
                  {t("priceDisplaySetupTitle")}
                </h2>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-fg-subtle">
                {t("priceDisplaySetupHint")}
              </p>
            </div>
            {priceDisplay.enabled ? (
              <span className="rounded-md bg-success-surface px-2.5 py-1.5 text-xs font-semibold text-success">
                {t("priceDisplayAlreadyEnabled")}
              </span>
            ) : priceEnableRequested ? (
              <span className="rounded-md bg-accent-surface px-2.5 py-1.5 text-xs font-semibold text-accent-strong">
                {t("priceDisplayReady")}
              </span>
            ) : (
              <Button
                type="button"
                variant="secondary"
                disabled={!priceNoticeAvailable}
                onClick={() => {
                  setPriceNoticeAcknowledged(false);
                  setPriceNoticeOpen(true);
                }}
              >
                {t("enablePriceDisplay")}
              </Button>
            )}
          </div>

          <input
            type="hidden"
            name="enablePriceDisplay"
            value={priceEnableRequested ? "on" : ""}
          />
          <input
            type="hidden"
            name="bookingPriceNoticeAcceptedVersion"
            value={priceEnableRequested ? priceDisplay.notice.version : ""}
          />

          {!priceDisplay.enabled && !priceNoticeAvailable && (
            <div className="mt-4">
              <StatusMessage kind="error">
                {t("priceDisplayNoticeUnavailable")}
              </StatusMessage>
            </div>
          )}

          {!priceDisplay.enabled && priceEnableRequested && (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
              <p className="mr-auto text-sm text-fg-muted">
                {t("priceDisplayEnablesOnCreate")}
              </p>
              <Button
                type="button"
                size="compact"
                variant="ghost"
                onClick={() => setPriceNoticeOpen(true)}
              >
                {t("reviewPriceAgreement")}
              </Button>
              <Button
                type="button"
                size="compact"
                variant="ghost"
                onClick={() => {
                  setPriceEnableRequested(false);
                  setPriceNoticeAcknowledged(false);
                  markDirty();
                }}
              >
                {t("keepPriceDisplayOff")}
              </Button>
            </div>
          )}

          {priceNoticeOpen && !priceDisplay.enabled && priceNoticeAvailable && (
            <div
              role="dialog"
              aria-modal="false"
              aria-labelledby="new-event-price-notice-title"
              className="mt-4 rounded-xl border border-border-strong bg-raised p-4 sm:p-5"
            >
              <p className="font-meta text-[0.6875rem] uppercase tracking-[0.14em] text-accent">
                {t("priceAgreementMarker")}
              </p>
              <h3
                id="new-event-price-notice-title"
                className="font-display mt-2 text-xl font-semibold text-fg"
              >
                {priceDisplay.notice.title}
              </h3>
              <div className="ui-pretty mt-3 whitespace-pre-line text-sm leading-6 text-fg-muted">
                {priceDisplay.notice.body}
              </div>
              <label className="mt-5 flex min-h-11 items-start gap-3 rounded-lg border border-border bg-control p-3 text-sm text-fg">
                <input
                  type="checkbox"
                  checked={priceNoticeAcknowledged}
                  data-manual-dirty="true"
                  onChange={(event) =>
                    setPriceNoticeAcknowledged(event.target.checked)
                  }
                  className="mt-0.5 h-5 w-5 shrink-0 rounded border-border-strong accent-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40"
                />
                <span>{t("priceDisplayAcknowledge")}</span>
              </label>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="primary"
                  disabled={!priceNoticeAcknowledged}
                  onClick={() => {
                    setPriceEnableRequested(true);
                    setPriceNoticeOpen(false);
                    markDirty();
                  }}
                >
                  {t("acceptPriceAgreement")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setPriceNoticeOpen(false);
                    setPriceNoticeAcknowledged(false);
                  }}
                >
                  {t("cancelPriceAgreement")}
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      {showOpenToggle && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="open"
            defaultChecked={initial.open}
            className="h-5 w-5 rounded border-border-strong accent-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40"
          />
          <span>{t("openLabel")}</span>
        </label>
      )}

      {state.error && (
        <p
          role="alert"
          className="rounded-lg bg-danger-surface px-3 py-2 text-sm text-danger"
        >
          {state.error === "validation"
            ? t("validationError")
            : state.error === "priceNoticeRequired"
              ? t("priceDisplayNoticeChanged")
            : state.error === "noSlots"
              ? t("noSlots")
              : state.error === "dayHasBookings"
                ? t("dayHasBookings")
                : tc("error")}
        </p>
      )}
      {state.ok && (
        <p
          role="status"
          className="rounded-lg bg-success-surface px-3 py-2 text-sm text-success"
        >
          {tc("saved")}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <Button type="submit" variant="primary" disabled={pending}>
          {submitLabel}
        </Button>
        <Link href={cancelHref} className={buttonClasses({ variant: "ghost" })}>
          {tc("cancel")}
        </Link>
      </div>
    </form>
  );
}
