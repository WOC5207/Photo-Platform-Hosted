"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  lookupMyBooking,
  type BookingLookupState
} from "@/app/[locale]/(public)/book/actions";

const inputCls =
  "rounded-lg border border-border-strong bg-surface px-3 py-2 text-fg outline-none focus:border-fg-subtle";

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
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="eventToken" value={eventToken} />
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-fg-muted">{t("nameLabel")} *</span>
          <input name="name" required maxLength={200} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-fg-muted">{t("contactValue")} *</span>
          <input
            name="contactValue"
            required
            maxLength={200}
            className={inputCls}
          />
        </label>

        {errorMessage && (
          <p role="alert" className="rounded-lg bg-danger-surface px-3 py-2 text-sm text-danger">
            {errorMessage}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="self-start rounded-full bg-fg px-6 py-3 text-sm font-semibold text-page transition hover:opacity-90 disabled:opacity-50"
        >
          {t("checkSubmit")}
        </button>
      </form>

      {state.results && state.results.length > 0 && (
        <ul className="flex flex-col gap-3">
          {state.results.map((r) => (
            <li
              key={r.cancelToken}
              className="rounded-xl border border-border bg-surface p-4"
            >
              <p className="font-semibold">{r.eventTitle}</p>
              <p className="font-mono text-sm text-fg-subtle">{r.slotLabel}</p>
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
                className="mt-3 inline-block rounded-full bg-fg px-5 py-2 text-sm font-semibold text-page transition hover:opacity-90"
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
