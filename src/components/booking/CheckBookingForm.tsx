"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  lookupMyBooking,
  type BookingLookupState
} from "@/app/[locale]/(public)/book/actions";
import {
  fieldClass,
  metaLabel,
  primaryClass
} from "./classes";
import styles from "./Archive.module.css";

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
    <div className={`${styles.rise} flex flex-col gap-6`}>
      <form
        action={formAction}
        aria-busy={pending}
        className="grid gap-4"
      >
        <input type="hidden" name="eventToken" value={eventToken} />
        <label htmlFor="booking-lookup-name" className="grid gap-1 text-sm">
          <span className="text-fg-muted">{t("nameLabel")} *</span>
          <input
            id="booking-lookup-name"
            name="name"
            required
            maxLength={200}
            autoComplete="name"
            disabled={pending}
            className={fieldClass}
          />
        </label>
        <label htmlFor="booking-lookup-contact" className="grid gap-1 text-sm">
          <span className="text-fg-muted">{t("contactValue")} *</span>
          <input
            id="booking-lookup-contact"
            name="contactValue"
            required
            maxLength={200}
            disabled={pending}
            className={fieldClass}
          />
        </label>

        {errorMessage && (
          <p
            role="alert"
            className="border-l-2 border-danger bg-danger-surface px-3 py-2 text-sm text-danger"
          >
            {errorMessage}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className={`${primaryClass} justify-self-start`}
        >
          {t("checkSubmit")} <span aria-hidden="true">→</span>
        </button>
      </form>

      {state.results && state.results.length > 0 && (
        <ul
          aria-live="polite"
          className={`${styles.board} ${styles.rise} grid gap-4 p-4 sm:p-6`}
        >
          {state.results.map((r) => (
            <li
              key={r.bookingId}
              data-full={r.cancelled ? "" : undefined}
              className={`${styles.tile} py-4 pl-6 pr-4`}
            >
              <p className="font-meta text-[0.625rem] uppercase tracking-[0.14em] text-accent-text">
                {r.slotLabel}
              </p>
              <p className="mt-1 text-lg font-bold uppercase tracking-[0.01em]">
                {r.eventTitle}
              </p>
              <p className="text-sm text-fg-muted">
                {displayName(r.name, r.subject)}
              </p>
              {r.pricePerPerson && (
                <p className={`${metaLabel} mt-1`}>
                  {t("pricePerPersonDisplay", { price: r.pricePerPerson })}
                </p>
              )}

              {r.cancelled ? (
                <p className="font-meta mt-2 text-[0.625rem] uppercase tracking-[0.14em] text-danger">
                  {t("statusCancelled")}
                </p>
              ) : r.prizeName ? (
                <p className="mt-3 border-l-2 border-success bg-success-surface px-3 py-2 text-sm font-semibold text-success-strong">
                  {t("checkResultPrize", { prize: r.prizeName })}
                </p>
              ) : r.lotteryLive ? (
                <p className="mt-2 text-sm text-fg-subtle">
                  {t("checkResultSpinReady")}
                </p>
              ) : null}

              {r.cancelToken ? (
                <Link
                  href={`/my-booking/${r.cancelToken}`}
                  className={`${primaryClass} mt-4`}
                >
                  {t("openBooking")} <span aria-hidden="true">→</span>
                </Link>
              ) : r.linkEmailedTo ? (
                <p className="mt-3 text-sm text-fg-muted">
                  {t("checkLinkEmailed", { email: r.linkEmailedTo })}
                </p>
              ) : (
                <p className="mt-3 text-sm text-fg-muted">
                  {t("checkLinkUnavailable")}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
