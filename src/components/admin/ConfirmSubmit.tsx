"use client";

export default function ConfirmSubmit({
  label,
  confirmText
}: {
  label: string;
  confirmText: string;
}) {
  return (
    <button
      type="submit"
      onClick={(e) => {
        if (!confirm(confirmText)) e.preventDefault();
      }}
      className="inline-flex min-h-10 items-center justify-center rounded-lg border border-danger-border px-4 py-2 text-sm font-semibold text-danger transition hover:border-danger hover:text-danger-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40 max-sm:min-h-11"
    >
      {label}
    </button>
  );
}
