"use client";

import {
  reconcileUserQuota,
  setUserQuota
} from "@/app/[locale]/admin/(protected)/actions";

/**
 * Per-account quota controls for the platform admin.
 *
 * Two separate forms rather than one: they are unrelated actions that happen to
 * sit in the same cell, and nesting forms is invalid HTML anyway.
 */
export default function QuotaControls({
  userId,
  quotaGib,
  labels
}: {
  userId: string;
  quotaGib: number;
  labels: { set: string; unit: string; reconcile: string; reconcileHint: string };
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      <form action={setUserQuota} className="flex items-center gap-1.5">
        <input type="hidden" name="id" value={userId} />
        <input
          name="quotaGib"
          type="number"
          min={0}
          step="0.5"
          defaultValue={quotaGib}
          className="w-20 rounded-lg border border-border-strong bg-page px-2 py-1 text-xs outline-none focus:border-fg-faint"
        />
        <span className="text-xs text-fg-subtle">{labels.unit}</span>
        <button
          type="submit"
          className="rounded-lg border border-border-strong px-2.5 py-1 text-xs text-fg-muted hover:border-fg-faint hover:text-fg"
        >
          {labels.set}
        </button>
      </form>
      <form action={reconcileUserQuota}>
        <input type="hidden" name="id" value={userId} />
        <button
          type="submit"
          title={labels.reconcileHint}
          className="rounded-lg border border-border-strong px-2.5 py-1 text-xs text-fg-muted hover:border-fg-faint hover:text-fg"
        >
          {labels.reconcile}
        </button>
      </form>
    </div>
  );
}
