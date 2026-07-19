"use client";

import { useEffect, useState, type ReactNode } from "react";
import Button from "@/components/ui/Button";

interface GateLabels {
  noticeLabel: string;
  waitLabel: string;
  secondsShort: string;
  ready: string;
  continue: string;
}

export default function RegistrationGate({
  delaySeconds,
  noticeTitle,
  noticeBody,
  labels,
  children
}: {
  delaySeconds: number;
  noticeTitle: string;
  noticeBody: string;
  labels: GateLabels;
  children: ReactNode;
}) {
  const safeDelay = Math.max(0, Math.min(300, Math.floor(delaySeconds)));
  const [remaining, setRemaining] = useState(safeDelay);
  const [continued, setContinued] = useState(false);

  useEffect(() => {
    if (remaining <= 0) return;
    const timeout = window.setTimeout(
      () => setRemaining((current) => Math.max(0, current - 1)),
      1_000
    );
    return () => window.clearTimeout(timeout);
  }, [remaining]);

  useEffect(() => {
    if (!continued) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById("register-username")?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [continued]);

  if (continued) return <>{children}</>;

  const progress = safeDelay === 0 ? 100 : ((safeDelay - remaining) / safeDelay) * 100;

  return (
    <article
      aria-labelledby="registration-notice-title"
      className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-7"
    >
      <div className="flex flex-col gap-2 border-b border-border pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-fg-subtle">
          {labels.noticeLabel}
        </p>
        <h1 id="registration-notice-title" className="text-2xl font-bold text-fg">
          {noticeTitle}
        </h1>
      </div>

      {noticeBody && (
        <div className="whitespace-pre-wrap rounded-lg border border-border bg-page p-4 text-sm leading-7 text-fg-muted sm:p-5">
          {noticeBody}
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-border pt-5">
        <div className="flex items-center justify-between gap-3 text-xs text-fg-subtle">
          <span aria-hidden="true">
            {remaining > 0
              ? `${labels.waitLabel} ${remaining}${labels.secondsShort}`
              : labels.ready}
          </span>
          <span role="status" aria-live="polite" className="sr-only">
            {remaining === 0 ? labels.ready : ""}
          </span>
          <span aria-hidden="true">{Math.round(progress)}%</span>
        </div>
        <div
          role="progressbar"
          aria-label={labels.waitLabel}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
          className="h-1.5 overflow-hidden rounded-full bg-border"
        >
          <div
            className="h-full rounded-full bg-fg transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <Button
          type="button"
          variant="primary"
          disabled={remaining > 0}
          onClick={() => setContinued(true)}
          className="w-full"
        >
          {labels.continue}
        </Button>
      </div>
    </article>
  );
}
