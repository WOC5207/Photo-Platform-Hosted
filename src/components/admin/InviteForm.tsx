"use client";

import { useActionState, useEffect, useRef } from "react";
import { createInvite, type InviteState } from "@/app/[locale]/admin/(protected)/actions";

export default function InviteForm({
  labels
}: {
  labels: { note: string; submit: string };
}) {
  const [state, action, pending] = useActionState<InviteState, FormData>(
    createInvite,
    {}
  );
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the note once the invite exists, so the next one starts blank rather
  // than looking like it kept the previous recipient's name.
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form
      ref={formRef}
      action={action}
      className="flex flex-wrap items-end gap-3 rounded-xl border border-border p-4"
    >
      <label className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-xs text-fg-subtle">{labels.note}</span>
        <input
          name="note"
          maxLength={200}
          className="w-full rounded-lg border border-border-strong bg-page px-3 py-2 text-sm outline-none focus:border-fg-faint"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-fg px-4 py-2 text-sm font-semibold text-page transition hover:opacity-90 disabled:opacity-50"
      >
        {labels.submit}
      </button>
    </form>
  );
}
