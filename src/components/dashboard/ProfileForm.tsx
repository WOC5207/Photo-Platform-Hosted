"use client";

import { useActionState, useEffect, useState } from "react";
import {
  updateProfile,
  type UpdateProfileState
} from "@/app/[locale]/dashboard/(protected)/account/actions";
import Button from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import SectionHeading from "@/components/ui/SectionHeading";
import StatusMessage from "@/components/ui/StatusMessage";

export default function ProfileForm({
  username,
  initialDisplayName,
  initialEmail,
  labels
}: {
  username: string;
  initialDisplayName: string;
  initialEmail: string;
  labels: {
    title: string;
    hint: string;
    username: string;
    displayName: string;
    email: string;
    emailHint: string;
    save: string;
    saved: string;
    error: string;
  };
}) {
  const [state, action, pending] = useActionState<
    UpdateProfileState,
    FormData
  >(updateProfile, {});
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [savedName, setSavedName] = useState(initialDisplayName);
  const [email, setEmail] = useState(initialEmail);
  const [savedEmail, setSavedEmail] = useState(initialEmail);
  const dirty = displayName !== savedName || email !== savedEmail;

  useEffect(() => {
    if (state.ok && state.displayName !== undefined) {
      setDisplayName(state.displayName);
      setSavedName(state.displayName);
    }
    if (state.ok && state.email !== undefined) {
      setEmail(state.email);
      setSavedEmail(state.email);
    }
    // The action-state object changes once per submission. Depending on the
    // field values too would mark every edit after a successful save as saved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
      <SectionHeading title={labels.title} description={labels.hint} />

      <form action={action} className="mt-5 flex flex-col gap-4">
        <Field label={labels.username} htmlFor="profile-username">
          <Input
            id="profile-username"
            name="username"
            value={username}
            readOnly
            aria-readonly="true"
            autoComplete="username"
            className="cursor-not-allowed bg-page/50 text-fg-subtle"
          />
        </Field>
        <Field label={labels.displayName} htmlFor="profile-display-name">
          <Input
            id="profile-display-name"
            name="displayName"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            maxLength={80}
            autoComplete="name"
            disabled={pending}
          />
        </Field>
        <Field
          label={labels.email}
          htmlFor="profile-email"
          hint={labels.emailHint}
        >
          <Input
            id="profile-email"
            name="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            maxLength={200}
            autoComplete="email"
            disabled={pending}
          />
        </Field>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            disabled={pending || !dirty}
            variant="primary"
          >
            {labels.save}
          </Button>
          {state.ok && !dirty && (
            <StatusMessage kind="success">{labels.saved}</StatusMessage>
          )}
          {state.error && (
            <StatusMessage kind="error">{labels.error}</StatusMessage>
          )}
        </div>
      </form>
    </section>
  );
}
