"use client";

import { useActionState } from "react";
import { register, type RegisterState } from "./actions";

export interface RegisterLabels {
  username: string;
  usernameHint: string;
  displayName: string;
  displayNameHint: string;
  password: string;
  confirmPassword: string;
  submit: string;
  errorValidation: string;
  errorMismatch: string;
  errorUsernameTaken: string;
  errorUsernameReserved: string;
  errorUsernameInvalid: string;
  errorBadInvite: string;
  errorRateLimited: string;
}

const ERROR_KEY: Record<
  NonNullable<RegisterState["error"]>,
  keyof RegisterLabels
> = {
  validation: "errorValidation",
  mismatch: "errorMismatch",
  usernameTaken: "errorUsernameTaken",
  usernameReserved: "errorUsernameReserved",
  usernameInvalid: "errorUsernameInvalid",
  badInvite: "errorBadInvite",
  rateLimited: "errorRateLimited"
};

export default function RegisterForm({
  code,
  labels
}: {
  code: string;
  labels: RegisterLabels;
}) {
  const [state, action, pending] = useActionState<RegisterState, FormData>(
    register,
    {}
  );

  const inputClass =
    "w-full rounded-lg border border-border-strong bg-page px-3 py-2 text-sm outline-none focus:border-fg-faint";

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="code" value={code} />

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{labels.username}</span>
        <input
          name="username"
          required
          maxLength={40}
          autoComplete="username"
          className={inputClass}
        />
        <span className="text-xs text-fg-subtle">{labels.usernameHint}</span>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{labels.displayName}</span>
        <input name="displayName" maxLength={80} className={inputClass} />
        <span className="text-xs text-fg-subtle">{labels.displayNameHint}</span>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{labels.password}</span>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{labels.confirmPassword}</span>
        <input
          name="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
          className={inputClass}
        />
      </label>

      {state.error && (
        <p className="text-sm text-danger">{labels[ERROR_KEY[state.error]]}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-fg px-4 py-2.5 text-sm font-semibold text-page transition hover:opacity-90 disabled:opacity-50"
      >
        {labels.submit}
      </button>
    </form>
  );
}
