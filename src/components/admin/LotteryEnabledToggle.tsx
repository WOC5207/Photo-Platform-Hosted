"use client";

import { updateLotteryEnabled } from "@/app/[locale]/admin/(protected)/bookings/lottery-actions";

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
    <form action={updateLotteryEnabled} className="flex items-center gap-2">
      <input type="hidden" name="bookingEventId" value={bookingEventId} />
      <input
        type="checkbox"
        id="lottery-enabled"
        name="lotteryEnabled"
        defaultChecked={defaultEnabled}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="h-4 w-4"
      />
      <label htmlFor="lottery-enabled" className="text-sm text-fg-muted">
        {label}
      </label>
    </form>
  );
}
