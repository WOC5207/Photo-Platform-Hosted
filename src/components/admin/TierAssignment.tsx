"use client";

import { assignTier } from "@/app/[locale]/admin/(protected)/tiers/actions";
import { clearUserQuotaOverride } from "@/app/[locale]/admin/(protected)/actions";

/**
 * Put one account on a tier, optionally until a date.
 *
 * The tier and the expiry submit together because an expiry without a tier is
 * meaningless — there is nothing for the default to lapse back to — and letting
 * them be saved separately would allow that state to exist between two clicks.
 */
export default function TierAssignment({
  userId,
  tiers,
  current,
  labels
}: {
  userId: string;
  tiers: { id: string; name: string }[];
  current: {
    tierId: string | null;
    /** YYYY-MM-DD for <input type="date">, or "" for none. */
    expiresAt: string;
    expired: boolean;
    overridden: boolean;
  };
  labels: {
    defaultTier: string;
    save: string;
    expiresAt: string;
    expiredNote: string;
    overrideNote: string;
    clearOverride: string;
  };
}) {
  return (
    <div className="flex flex-col items-start gap-2">
      <form action={assignTier} className="flex w-full flex-col gap-3">
        <input type="hidden" name="id" value={userId} />
        <label className="flex flex-col gap-1 text-xs text-fg-subtle">
          <span>{labels.defaultTier}</span>
          <select
            name="tierId"
            defaultValue={current.tierId ?? ""}
            className="min-h-10 rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm outline-none focus-visible:border-fg-faint focus-visible:ring-2 focus-visible:ring-fg/20"
          >
            <option value="">{labels.defaultTier}</option>
            {tiers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-fg-subtle">
          <span>{labels.expiresAt}</span>
          <input
            name="expiresAt"
            type="date"
            defaultValue={current.expiresAt}
            className="min-h-10 rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm outline-none focus-visible:border-fg-faint focus-visible:ring-2 focus-visible:ring-fg/20"
          />
        </label>
        <button
          type="submit"
          className="min-h-10 w-fit rounded-lg border border-border-strong px-3 py-2 text-sm font-medium text-fg-muted hover:border-fg-faint hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40 max-sm:min-h-11"
        >
          {labels.save}
        </button>
      </form>

      {current.expired && (
        <p className="text-xs text-fg-subtle">{labels.expiredNote}</p>
      )}

      {current.overridden && (
        <form action={clearUserQuotaOverride} className="flex items-center gap-1.5">
          <input type="hidden" name="id" value={userId} />
          <span className="text-xs text-fg-subtle">{labels.overrideNote}</span>
          <button
            type="submit"
            className="min-h-10 rounded-lg border border-border-strong px-3 py-2 text-sm font-medium text-fg-muted hover:border-fg-faint hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40 max-sm:min-h-11"
          >
            {labels.clearOverride}
          </button>
        </form>
      )}
    </div>
  );
}
