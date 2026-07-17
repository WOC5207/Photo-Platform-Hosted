"use client";

import { useActionState, useState } from "react";
import { usernameError } from "@/lib/username";
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
  errorUsernameUppercase: string;
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
  usernameUppercase: "errorUsernameUppercase",
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
  const [username, setUsername] = useState("");
  const trimmedUsername = username.trim();
  const usernameProblem = trimmedUsername ? usernameError(trimmedUsername) : null;
  let clientUsernameError: string | null = null;
  if (/[A-Z]/.test(trimmedUsername)) {
    clientUsernameError = labels.errorUsernameUppercase;
  } else if (usernameProblem === "reserved") {
    clientUsernameError = labels.errorUsernameReserved;
  } else if (usernameProblem === "invalid") {
    clientUsernameError = labels.errorUsernameInvalid;
  }

  const inputClass =
    "min-h-10 w-full rounded-lg border border-border-strong bg-page px-3 py-2 text-sm outline-none focus-visible:border-fg-subtle focus-visible:ring-2 focus-visible:ring-fg/20 max-sm:min-h-11";

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="code" value={code} />

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{labels.username}</span>
        <input
          name="username"
          required
          minLength={2}
          maxLength={31}
          pattern="[a-z0-9][a-z0-9-]{1,30}"
          title={labels.errorUsernameInvalid}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          aria-invalid={clientUsernameError ? true : undefined}
          aria-describedby={
            clientUsernameError
              ? "register-username-hint register-username-error"
              : "register-username-hint"
          }
          className={inputClass}
        />
        <span id="register-username-hint" className="text-xs text-fg-subtle">
          {labels.usernameHint}
        </span>
        {clientUsernameError && (
          <span
            id="register-username-error"
            role="alert"
            className="text-xs text-danger"
          >
            {clientUsernameError}
          </span>
        )}
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
        <p role="alert" className="text-sm text-danger">{labels[ERROR_KEY[state.error]]}</p>
      )}

      <button
        type="submit"
        disabled={pending || Boolean(clientUsernameError)}
        className="min-h-10 rounded-lg bg-fg px-4 py-2.5 text-sm font-semibold text-page transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40 disabled:opacity-50 max-sm:min-h-11"
      >
        {labels.submit}
      </button>
    </form>
  );
}
