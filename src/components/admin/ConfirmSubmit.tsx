"use client";

import { useConfirm } from "@/components/ui/ConfirmDialog";

export default function ConfirmSubmit({
  label,
  confirmText
}: {
  label: string;
  confirmText: string;
}) {
  const { confirm, dialog } = useConfirm();
  return (
    <>
      <button
        type="submit"
        onClick={(event) => {
          // Hold the submission until the app's dialog answers, then replay it
          // from this button so its form action still runs.
          event.preventDefault();
          const button = event.currentTarget;
          void confirm({ message: confirmText, confirmLabel: label }).then((ok) => {
            if (ok) button.form?.requestSubmit(button);
          });
        }}
        className="inline-flex min-h-10 items-center justify-center rounded-lg border border-danger-border px-4 py-2 text-sm font-semibold text-danger transition hover:border-danger hover:text-danger-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40 max-sm:min-h-11"
      >
        {label}
      </button>
      {dialog}
    </>
  );
}
