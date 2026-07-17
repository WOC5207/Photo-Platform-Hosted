"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  changePassword,
  type ChangePasswordState
} from "@/app/[locale]/dashboard/(protected)/account/actions";

export default function ChangePasswordForm({
  labels
}: {
  labels: {
    title: string;
    hint: string;
    current: string;
    next: string;
    confirm: string;
    submit: string;
    ok: string;
    errorValidation: string;
    errorMismatch: string;
    errorWrongCurrent: string;
    errorRateLimited: string;
  };
}) {
  const [state, action] = useActionState<ChangePasswordState, FormData>(
    changePassword,
    {}
  );
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the fields on success — leaving a password sitting in an input after
  // it has been changed is exactly the sort of thing a shoulder or a screen
  // share picks up.
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  const error =
    state.error === "wrongCurrent"
      ? labels.errorWrongCurrent
      : state.error === "mismatch"
        ? labels.errorMismatch
        : state.error === "rateLimited"
          ? labels.errorRateLimited
          : state.error === "validation"
            ? labels.errorValidation
            : null;

  const field =
    "w-full rounded-lg border border-border-strong bg-page px-3 py-2 text-sm outline-none focus:border-fg-faint";

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold">{labels.title}</h2>
      <p className="mt-1 text-xs text-fg-subtle">{labels.hint}</p>
      <form ref={formRef} action={action} className="mt-4 flex flex-col gap-3">
        {/* autoComplete hints let a password manager offer the right thing and
            store the result, rather than saving the new password as a login. */}
        <label className="flex flex-col gap-1">
          <span className="text-xs text-fg-subtle">{labels.current}</span>
          <input
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-fg-subtle">{labels.next}</span>
          <input
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-fg-subtle">{labels.confirm}</span>
          <input
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            className={field}
          />
        </label>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-fg-muted hover:border-fg-faint hover:text-fg"
          >
            {labels.submit}
          </button>
          {state.ok && <p className="text-xs text-fg-subtle">{labels.ok}</p>}
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
      </form>
    </div>
  );
}
