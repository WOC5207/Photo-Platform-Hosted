"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  setBookingStatus,
  type BookingStatusState
} from "@/app/[locale]/dashboard/(protected)/bookings/actions";

export default function BookingStatusButton({
  bookingId,
  status
}: {
  bookingId: string;
  status: string;
}) {
  const t = useTranslations("adminBookings");
  const [state, formAction, pending] = useActionState<
    BookingStatusState,
    FormData
  >(setBookingStatus, {});

  const isConfirmed = status === "confirmed";
  const nextStatus = isConfirmed ? "cancelled" : "confirmed";

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="status" value={nextStatus} />
      <button
        type="submit"
        disabled={pending}
        onClick={(event) => {
          if (isConfirmed && !confirm(t("confirmCancelBooking"))) {
            event.preventDefault();
          }
        }}
        className="inline-flex min-h-10 items-center rounded-lg border border-border-strong px-3 py-2 text-xs font-semibold text-fg-muted transition hover:border-fg-faint hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40 disabled:opacity-50 max-sm:min-h-11"
      >
        {isConfirmed ? t("cancelBooking") : t("restoreBooking")}
      </button>
      {state.error === "slotFull" && (
        <span role="alert" className="max-w-[16rem] text-right text-xs text-danger">
          {t("restoreSlotFull")}
        </span>
      )}
    </form>
  );
}
