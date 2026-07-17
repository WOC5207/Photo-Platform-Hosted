"use client";

import { useState } from "react";
import Dialog from "@/components/ui/Dialog";

export interface ContactUsLabels {
  button: string;
  close: string;
  visitLink: string;
}

/**
 * "Contact us" trigger + modal, admin-configured (title/link/QR code). Reused
 * for both the header (top-right) and footer placements; renders nothing if
 * the admin hasn't enabled the feature or left it fully empty.
 */
export default function ContactUsButton({
  title,
  url,
  qrUrl,
  labels,
  className
}: {
  title: string;
  url: string;
  qrUrl: string;
  labels: ContactUsLabels;
  className: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {labels.button}
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        label={title || labels.button}
        panelClassName="max-w-sm p-6 text-center"
      >
        <div className="flex flex-col items-center gap-4">
          <div className="flex w-full items-start justify-between gap-4">
            <h3 className="text-lg font-semibold">{title || labels.button}</h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={labels.close}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-xl text-fg-subtle transition hover:bg-fg/5 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40"
            >
              ×
            </button>
          </div>

          {qrUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrUrl}
              alt=""
              className="h-56 w-56 rounded-lg border border-fg/10 bg-white object-contain p-2"
            />
          )}

          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-fg px-4 py-2 text-sm font-semibold text-page transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/50"
            >
              {labels.visitLink}
            </a>
          )}
        </div>
      </Dialog>
    </>
  );
}
