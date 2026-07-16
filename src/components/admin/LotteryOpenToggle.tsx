"use client";

import { updateLotteryDrawOpen } from "@/app/[locale]/admin/(protected)/bookings/lottery-actions";

export default function LotteryOpenToggle({
  drawId,
  defaultOpen,
  openLabel
}: {
  drawId: string;
  defaultOpen: boolean;
  openLabel: string;
}) {
  return (
    <form action={updateLotteryDrawOpen} className="flex items-center gap-2">
      <input type="hidden" name="drawId" value={drawId} />
      <input
        type="checkbox"
        id="lottery-open"
        name="open"
        defaultChecked={defaultOpen}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="h-4 w-4"
      />
      <label htmlFor="lottery-open" className="text-sm text-fg-muted">
        {openLabel}
      </label>
    </form>
  );
}
