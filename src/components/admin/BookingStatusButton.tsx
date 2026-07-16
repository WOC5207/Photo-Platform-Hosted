"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  setBookingStatus,
  type BookingStatusState
} from "@/app/[locale]/admin/(protected)/bookings/actions";

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
        className="rounded-md border border-border-strong px-2 py-1 text-xs text-fg-muted transition hover:border-fg-faint hover:text-fg disabled:opacity-50"
      >
        {isConfirmed ? t("cancelBooking") : t("restoreBooking")}
      </button>
      {state.error === "slotFull" && (
        <span className="max-w-[16rem] text-right text-xs text-danger">
          {t("restoreSlotFull")}
        </span>
      )}
    </form>
  );
}
