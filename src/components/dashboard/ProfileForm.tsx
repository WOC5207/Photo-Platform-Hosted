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
  labels
}: {
  username: string;
  initialDisplayName: string;
  labels: {
    title: string;
    hint: string;
    username: string;
    displayName: string;
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
  const dirty = displayName !== savedName;

  useEffect(() => {
    if (state.ok && state.value !== undefined) {
      setDisplayName(state.value);
      setSavedName(state.value);
    }
    // The action-state object changes once per submission. Depending on the
    // field value too would mark every edit after a successful save as saved.
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
