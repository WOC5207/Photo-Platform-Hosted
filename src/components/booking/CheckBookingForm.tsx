"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  lookupMyBooking,
  type BookingLookupState
} from "@/app/[locale]/(public)/book/actions";
import { buttonClasses } from "@/components/ui/Button";
import Button from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import StatusMessage from "@/components/ui/StatusMessage";

function displayName(name: string, subject: string) {
  return subject ? `${name} · ${subject}` : name;
}

export default function CheckBookingForm({
  eventToken
}: {
  eventToken: string;
}) {
  const t = useTranslations("booking");
  const [state, formAction, pending] = useActionState<
    BookingLookupState,
    FormData
  >(lookupMyBooking, {});

  const errorMessage =
    state.error === "validation"
      ? t("checkErrorValidation")
      : state.error === "rateLimited"
        ? t("checkErrorRateLimited")
        : state.error === "notFound"
          ? t("checkNotFound")
          : null;

  return (
    <div className="flex flex-col gap-6">
      <form
        action={formAction}
        aria-busy={pending}
        className="flex flex-col gap-4"
      >
        <input type="hidden" name="eventToken" value={eventToken} />
        <Field label={t("nameLabel")} htmlFor="booking-lookup-name" required>
          <Input
            id="booking-lookup-name"
            name="name"
            required
            maxLength={200}
            autoComplete="name"
            disabled={pending}
          />
        </Field>
        <Field
          label={t("contactValue")}
          htmlFor="booking-lookup-contact"
          required
        >
          <Input
            id="booking-lookup-contact"
            name="contactValue"
            required
            maxLength={200}
            disabled={pending}
          />
        </Field>

        {errorMessage && <StatusMessage kind="error">{errorMessage}</StatusMessage>}

        <Button type="submit" variant="primary" disabled={pending} className="self-start">
          {t("checkSubmit")}
        </Button>
      </form>

      {state.results && state.results.length > 0 && (
        <ul aria-live="polite" className="flex flex-col gap-3">
          {state.results.map((r) => (
            <li
              key={r.cancelToken}
              className="rounded-xl border border-border bg-surface p-4"
            >
              <p className="font-semibold">{r.eventTitle}</p>
              <p className="font-meta text-sm text-fg-subtle">{r.slotLabel}</p>
              {r.pricePerPerson && (
                <p className="mt-1 text-sm font-medium text-fg-muted">
                  {t("pricePerPersonDisplay", { price: r.pricePerPerson })}
                </p>
              )}
              <p className="mt-1 text-sm text-fg-muted">
                {displayName(r.name, r.subject)}
              </p>

              {r.cancelled ? (
                <p className="mt-2 text-sm text-danger">
                  {t("statusCancelled")}
                </p>
              ) : r.prizeName ? (
                <p className="mt-2 rounded-lg border border-success-border bg-success-surface p-3 text-center text-sm font-semibold text-success-strong">
                  {t("checkResultPrize", { prize: r.prizeName })}
                </p>
              ) : r.lotteryLive ? (
                <p className="mt-2 text-sm text-fg-subtle">
                  {t("checkResultSpinReady")}
                </p>
              ) : null}

              <Link
                href={`/my-booking/${r.cancelToken}`}
                className={buttonClasses({
                  variant: "primary",
                  className: "mt-3"
                })}
              >
                {t("openBooking")}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
