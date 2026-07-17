"use client";

import { useActionState } from "react";
import {
  resetUserPassword,
  type ResetPasswordState
} from "@/app/[locale]/admin/(protected)/actions";

/**
 * Reset one account's password to a generated one.
 *
 * The password comes back in this form's own state and is rendered once. It is
 * not stored anywhere and cannot be retrieved again — navigating away loses it,
 * which is why the copy says to send it now. Losing it is recoverable: reset
 * again and this one stops working.
 */
export default function ResetPasswordControl({
  userId,
  labels
}: {
  userId: string;
  labels: {
    reset: string;
    confirm: string;
    generatedFor: string;
    copyHint: string;
    error: string;
  };
}) {
  const [state, action] = useActionState<ResetPasswordState, FormData>(
    resetUserPassword,
    {}
  );

  return (
    <div className="flex flex-col items-end gap-1">
      <form
        action={action}
        onSubmit={(e) => {
          if (!confirm(labels.confirm)) e.preventDefault();
        }}
      >
        <input type="hidden" name="id" value={userId} />
        <button
          type="submit"
          className="rounded-lg border border-border-strong px-2.5 py-1 text-xs text-fg-muted hover:border-fg-faint hover:text-fg"
        >
          {labels.reset}
        </button>
      </form>

      {state.error && <p className="text-xs text-danger">{labels.error}</p>}

      {state.password && (
        <div className="mt-1 max-w-xs rounded-lg border border-border-strong bg-page p-2 text-right">
          <p className="text-xs text-fg-subtle">{labels.generatedFor}</p>
          {/* Selectable, monospace, and never re-fetchable: this element is the
              only copy that will ever exist. */}
          <code className="mt-1 block select-all break-all font-mono text-sm text-fg">
            {state.password}
          </code>
          <p className="mt-1 text-xs text-fg-subtle">{labels.copyHint}</p>
        </div>
      )}
    </div>
  );
}
