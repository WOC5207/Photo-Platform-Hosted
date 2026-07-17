"use client";

import { useState } from "react";

export default function CopyButton({
  text,
  label = "Copy",
  copiedLabel = "Copied"
}: {
  text: string;
  label?: string;
  copiedLabel?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      aria-label={copied ? copiedLabel : label}
      title={copied ? copiedLabel : label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable (e.g. non-HTTPS) — user can copy manually */
        }
      }}
      className="flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-border-strong px-2 text-sm text-fg-muted transition hover:border-fg-faint hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40 max-sm:min-h-11 max-sm:min-w-11"
    >
      <span aria-hidden="true">{copied ? "✓" : "⧉"}</span>
    </button>
  );
}
