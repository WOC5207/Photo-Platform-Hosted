"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  createTier,
  type TierState
} from "@/app/[locale]/admin/(protected)/tiers/actions";

export default function NewTierForm({
  labels
}: {
  labels: {
    title: string;
    name: string;
    unit: string;
    create: string;
    errorValidation: string;
    errorDuplicate: string;
  };
}) {
  const [state, action] = useActionState<TierState, FormData>(createTier, {});
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
      <h2 className="text-sm font-semibold">{labels.title}</h2>
      <form ref={formRef} action={action} className="mt-3 flex flex-wrap items-center gap-2">
        <input
          name="name"
          placeholder={labels.name}
          maxLength={60}
          className="w-48 rounded-lg border border-border-strong bg-page px-2 py-1.5 text-sm outline-none focus:border-fg-faint"
        />
        <input
          name="quotaGib"
          type="number"
          min={0}
          step="0.5"
          defaultValue={5}
          className="w-24 rounded-lg border border-border-strong bg-page px-2 py-1.5 text-sm outline-none focus:border-fg-faint"
        />
        <span className="text-xs text-fg-subtle">{labels.unit}</span>
        <button
          type="submit"
          className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-fg-muted hover:border-fg-faint hover:text-fg"
        >
          {labels.create}
        </button>
        {error && <p className="text-xs text-danger">{error}</p>}
      </form>
    </div>
  );
}
