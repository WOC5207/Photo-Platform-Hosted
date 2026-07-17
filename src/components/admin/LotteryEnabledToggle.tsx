"use client";

import { updateLotteryEnabled } from "@/app/[locale]/dashboard/(protected)/bookings/lottery-actions";

export default function LotteryEnabledToggle({
  bookingEventId,
  defaultEnabled,
  label
}: {
  bookingEventId: string;
  defaultEnabled: boolean;
  label: string;
}) {
  return (
    <form action={updateLotteryEnabled} className="flex min-h-11 items-center gap-3">
      <input type="hidden" name="bookingEventId" value={bookingEventId} />
      <input
        type="checkbox"
        id="lottery-enabled"
        name="lotteryEnabled"
        defaultChecked={defaultEnabled}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="h-5 w-5 rounded border-border-strong accent-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40"
      />
      <label htmlFor="lottery-enabled" className="text-sm text-fg-muted">
        {label}
      </label>
    </form>
  );
}
