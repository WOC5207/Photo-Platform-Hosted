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
    <div className="flex flex-col items-start gap-1">
      <form action={assignTier} className="flex flex-wrap items-center gap-1.5">
        <input type="hidden" name="id" value={userId} />
        <select
          name="tierId"
          defaultValue={current.tierId ?? ""}
          className="rounded-lg border border-border-strong bg-page px-2 py-1 text-xs outline-none focus:border-fg-faint"
        >
          {/* Empty value = follow the default tier, stored as NULL. */}
          <option value="">{labels.defaultTier}</option>
          {tiers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <input
          name="expiresAt"
          type="date"
          defaultValue={current.expiresAt}
          title={labels.expiresAt}
          className="rounded-lg border border-border-strong bg-page px-2 py-1 text-xs outline-none focus:border-fg-faint"
        />
        <button
          type="submit"
          className="rounded-lg border border-border-strong px-2.5 py-1 text-xs text-fg-muted hover:border-fg-faint hover:text-fg"
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
            className="rounded-lg border border-border-strong px-2 py-0.5 text-xs text-fg-muted hover:border-fg-faint hover:text-fg"
          >
            {labels.clearOverride}
          </button>
        </form>
      )}
    </div>
  );
}
