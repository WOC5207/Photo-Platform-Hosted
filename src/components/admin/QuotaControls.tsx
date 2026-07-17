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
    <div className="flex flex-wrap items-center gap-2">
      <form action={setUserQuota} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={userId} />
        <input
          name="quotaGib"
          type="number"
          min={0}
          step="0.5"
          defaultValue={quotaGib}
          aria-label={`${labels.set} (${labels.unit})`}
          className="min-h-10 w-24 rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm outline-none focus-visible:border-fg-faint focus-visible:ring-2 focus-visible:ring-fg/20"
        />
        <span className="text-sm text-fg-subtle">{labels.unit}</span>
        <button
          type="submit"
          className="min-h-10 rounded-lg border border-border-strong px-3 py-2 text-sm font-medium text-fg-muted hover:border-fg-faint hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40 max-sm:min-h-11"
        >
          {labels.set}
        </button>
      </form>
      <form action={reconcileUserQuota}>
        <input type="hidden" name="id" value={userId} />
        <button
          type="submit"
          title={labels.reconcileHint}
          className="min-h-10 rounded-lg border border-border-strong px-3 py-2 text-sm font-medium text-fg-muted hover:border-fg-faint hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40 max-sm:min-h-11"
        >
          {labels.reconcile}
        </button>
      </form>
    </div>
  );
}
