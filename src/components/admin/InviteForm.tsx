"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { createInvite, type InviteState } from "@/app/[locale]/admin/(protected)/actions";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import { Field, Input } from "@/components/ui/Field";
import StatusMessage from "@/components/ui/StatusMessage";

export default function InviteForm({
  labels
}: {
  labels: { note: string; submit: string; cancel: string; error: string };
}) {
  const [state, action, pending] = useActionState<InviteState, FormData>(
    createInvite,
    {}
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  // Clear the note once the invite exists, so the next one starts blank rather
  // than looking like it kept the previous recipient's name.
  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setOpen(false);
    }
  }, [state.ok]);

  return (
    <>
      <Button type="button" variant="primary" onClick={() => setOpen(true)}>
        + {labels.submit}
      </Button>
      <Dialog open={open} onClose={close} label={labels.submit} panelClassName="max-w-lg p-5 sm:p-6">
        <h2 className="text-lg font-semibold">{labels.submit}</h2>
        <form ref={formRef} action={action} className="mt-5 flex flex-col gap-5">
          <Field label={labels.note} htmlFor="invite-note">
            <Input id="invite-note" name="note" maxLength={200} autoFocus />
          </Field>
          {state.error && <StatusMessage kind="error">{labels.error}</StatusMessage>}
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
            <Button type="button" variant="ghost" onClick={close}>
              {labels.cancel}
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {labels.submit}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
