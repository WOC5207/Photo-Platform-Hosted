"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  changePassword,
  type ChangePasswordState
} from "@/app/[locale]/dashboard/(protected)/account/actions";
import Button from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import SectionHeading from "@/components/ui/SectionHeading";
import StatusMessage from "@/components/ui/StatusMessage";

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
  const [state, action, pending] = useActionState<ChangePasswordState, FormData>(
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

  return (
    <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
      <SectionHeading title={labels.title} description={labels.hint} />
      <form ref={formRef} action={action} className="mt-5 flex flex-col gap-4">
        {/* autoComplete hints let a password manager offer the right thing and
            store the result, rather than saving the new password as a login. */}
        <Field label={labels.current} htmlFor="account-current-password">
          <Input
            id="account-current-password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            maxLength={72}
            required
            disabled={pending}
          />
        </Field>
        <Field label={labels.next} htmlFor="account-new-password">
          <Input
            id="account-new-password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={72}
            required
            disabled={pending}
          />
        </Field>
        <Field label={labels.confirm} htmlFor="account-confirm-password">
          <Input
            id="account-confirm-password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            maxLength={72}
            required
            disabled={pending}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" disabled={pending}>
            {labels.submit}
          </Button>
          {state.ok && <StatusMessage kind="success">{labels.ok}</StatusMessage>}
          {error && <StatusMessage kind="error">{error}</StatusMessage>}
        </div>
      </form>
    </section>
  );
}
