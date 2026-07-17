"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  createTier,
  type TierState
} from "@/app/[locale]/admin/(protected)/tiers/actions";
import Button from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import StatusMessage from "@/components/ui/StatusMessage";

export default function NewTierForm({
  labels
}: {
  labels: {
    title: string;
    name: string;
    limit: string;
    unit: string;
    create: string;
    errorValidation: string;
    errorDuplicate: string;
  };
}) {
  const [state, action, pending] = useActionState<TierState, FormData>(createTier, {});
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the fields once a tier is actually created, so a second one can be
  // added without re-selecting the text. Only on ok — a rejected submission
  // must keep what was typed.
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  const error =
    state.error === "duplicate"
      ? labels.errorDuplicate
      : state.error === "validation"
        ? labels.errorValidation
        : null;

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h2 className="text-lg font-semibold">{labels.title}</h2>
      <form ref={formRef} action={action} className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
        <Field label={labels.name} htmlFor="new-tier-name">
          <Input id="new-tier-name" name="name" maxLength={60} disabled={pending} />
        </Field>
        <Field label={labels.limit} htmlFor="new-tier-limit">
          <div className="flex items-center gap-2">
            <Input
              id="new-tier-limit"
              name="quotaGib"
              type="number"
              min={0}
              step="0.5"
              defaultValue={5}
              disabled={pending}
            />
            <span className="shrink-0 text-xs text-fg-subtle">{labels.unit}</span>
          </div>
        </Field>
        <Button type="submit" variant="primary" disabled={pending}>
          {labels.create}
        </Button>
        {error && <div className="sm:col-span-3"><StatusMessage kind="error">{error}</StatusMessage></div>}
      </form>
    </div>
  );
}
