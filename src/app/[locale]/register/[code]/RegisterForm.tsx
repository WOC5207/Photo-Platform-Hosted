"use client";

import { useActionState, useState } from "react";
import { usernameError } from "@/lib/username";
import { register, type RegisterState } from "./actions";
import Button from "@/components/ui/Button";
import { controlClasses, Field, Input } from "@/components/ui/Field";
import StatusMessage from "@/components/ui/StatusMessage";

export interface RegisterLabels {
  username: string;
  usernameHint: string;
  displayName: string;
  displayNameHint: string;
  password: string;
  passwordHint: string;
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
  errorNoticeChanged: string;
  errorConsentRequired: string;
  consentLabel: string;
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
  rateLimited: "errorRateLimited",
  noticeChanged: "errorNoticeChanged",
  consentRequired: "errorConsentRequired"
};

export default function RegisterForm({
  code,
  consentRequired,
  noticeVersion,
  labels
}: {
  code: string;
  consentRequired: boolean;
  noticeVersion: number;
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

  return (
    <form action={action} aria-busy={pending} className="flex flex-col gap-4">
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="noticeVersion" value={noticeVersion} />

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{labels.username}</span>
        <input
          id="register-username"
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
          disabled={pending}
          className={controlClasses}
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

      <Field
        label={labels.displayName}
        htmlFor="register-display-name"
        hint={labels.displayNameHint}
      >
        <Input
          id="register-display-name"
          name="displayName"
          maxLength={80}
          autoComplete="name"
          disabled={pending}
        />
      </Field>

      <Field
        label={labels.password}
        htmlFor="register-password"
        hint={labels.passwordHint}
        required
      >
        <Input
          id="register-password"
          name="password"
          type="password"
          required
          minLength={8}
          maxLength={72}
          autoComplete="new-password"
          disabled={pending}
        />
      </Field>

      <Field
        label={labels.confirmPassword}
        htmlFor="register-confirm-password"
        required
      >
        <Input
          id="register-confirm-password"
          name="confirmPassword"
          type="password"
          required
          maxLength={72}
          autoComplete="new-password"
          disabled={pending}
        />
      </Field>

      {consentRequired && (
        <label className="flex items-start gap-3 rounded-lg border border-border bg-surface p-3 text-sm">
          <input
            type="checkbox"
            name="consentAccepted"
            required
            disabled={pending}
            className="mt-0.5 size-5 shrink-0 accent-accent focus-visible:ring-2 focus-visible:ring-accent/40"
          />
          <span>{labels.consentLabel}</span>
        </label>
      )}

      {state.error && (
        <StatusMessage kind="error">{labels[ERROR_KEY[state.error]]}</StatusMessage>
      )}

      <Button
        type="submit"
        variant="primary"
        disabled={pending || Boolean(clientUsernameError)}
      >
        {labels.submit}
      </Button>
    </form>
  );
}
