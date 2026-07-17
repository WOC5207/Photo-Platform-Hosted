"use client";

import { useActionState } from "react";
import {
  deleteTier,
  setDefaultTier,
  updateTier,
  type DeleteTierState
} from "@/app/[locale]/admin/(protected)/tiers/actions";

/**
 * One tier: rename, re-limit, promote to default, delete.
 *
 * Separate forms rather than one, because they are unrelated actions that
 * happen to share a row — and nesting forms is invalid HTML anyway. Same shape
 * as QuotaControls next door.
 */
export default function TierRow({
  tier,
  labels
}: {
  tier: {
    id: string;
    name: string;
    quotaGib: number;
    quotaLabel: string;
    isDefault: boolean;
    accountCount: number;
  };
  labels: {
    save: string;
    unit: string;
    makeDefault: string;
    defaultBadge: string;
    defaultHint: string;
    delete: string;
    confirmDelete: string;
    errorIsDefault: string;
    errorInUse: string;
    accounts: string;
  };
}) {
  const [deleteState, deleteAction] = useActionState<DeleteTierState, FormData>(
    deleteTier,
    {}
  );

  const error =
    deleteState.error === "isDefault"
      ? labels.errorIsDefault
      : deleteState.error === "inUse"
        ? labels.errorInUse
        : null;

  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-3">
        <form
          action={updateTier}
          id={`tier-${tier.id}`}
          className="flex items-center gap-2"
        >
          <input type="hidden" name="id" value={tier.id} />
          <input
            name="name"
            defaultValue={tier.name}
            maxLength={60}
            className="w-40 rounded-lg border border-border-strong bg-page px-2 py-1 text-sm outline-none focus:border-fg-faint"
          />
          {tier.isDefault && (
            <span
              title={labels.defaultHint}
              className="shrink-0 rounded-full border border-border-strong px-2 py-0.5 text-xs text-fg-subtle"
            >
              {labels.defaultBadge}
            </span>
          )}
        </form>
      </td>

      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <input
            form={`tier-${tier.id}`}
            name="quotaGib"
            type="number"
            min={0}
            step="0.5"
            defaultValue={tier.quotaGib}
            className="w-24 rounded-lg border border-border-strong bg-page px-2 py-1 text-sm outline-none focus:border-fg-faint"
          />
          <span className="text-xs text-fg-subtle">{labels.unit}</span>
          <button
            form={`tier-${tier.id}`}
            type="submit"
            className="rounded-lg border border-border-strong px-2.5 py-1 text-xs text-fg-muted hover:border-fg-faint hover:text-fg"
          >
            {labels.save}
          </button>
        </div>
      </td>

      <td className="px-4 py-3 text-fg-muted">{labels.accounts}</td>

      <td className="px-4 py-3">
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            {!tier.isDefault && (
              <form action={setDefaultTier}>
                <input type="hidden" name="id" value={tier.id} />
                <button
                  type="submit"
                  title={labels.defaultHint}
                  className="rounded-lg border border-border-strong px-2.5 py-1 text-xs text-fg-muted hover:border-fg-faint hover:text-fg"
                >
                  {labels.makeDefault}
                </button>
              </form>
            )}
            {/* The default tier cannot be deleted at all, so it gets no button
                rather than a button that always refuses. The in-use case still
                needs the server's answer — the count here could be stale. */}
            {!tier.isDefault && (
              <form
                action={deleteAction}
                onSubmit={(e) => {
                  if (!confirm(labels.confirmDelete)) e.preventDefault();
                }}
              >
                <input type="hidden" name="id" value={tier.id} />
                <button
                  type="submit"
                  className="rounded-lg border border-border-strong px-2.5 py-1 text-xs text-danger hover:border-danger"
                >
                  {labels.delete}
                </button>
              </form>
            )}
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
      </td>
    </tr>
  );
}
