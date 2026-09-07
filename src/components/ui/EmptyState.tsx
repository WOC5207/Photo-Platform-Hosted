import type { ReactNode } from "react";

/** A first-use contact sheet: clear next action, then the steps to a finished shoot. */
export default function EmptyState({
  title, description, action, steps, kind = "gallery"
}: {
  title: string;
  description: string;
  action?: ReactNode;
  steps?: { title: string; description: string }[];
  kind?: "gallery" | "bookings";
}) {
  return (
    <section className="ui-panel overflow-hidden">
      <div className="flex flex-col items-start gap-6 p-6 sm:flex-row sm:gap-8 sm:p-8 lg:p-10">
        <div aria-hidden="true" className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-border-strong bg-control text-accent">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            {kind === "bookings" ? <>
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M8 3v4M16 3v4M3 10h18m-13 5 2 2 5-5" />
            </> : <>
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <circle cx="8" cy="9" r="1.5" />
              <path d="m3 17 5-5 4 4 3-3 6 6" />
            </>}
          </svg>
        </div>
        <div className="min-w-0 max-w-2xl">
          <h2 className="font-display ui-balance text-2xl font-semibold leading-tight tracking-[-0.02em] sm:text-3xl">{title}</h2>
          <p className="ui-pretty mt-3 text-base leading-relaxed text-fg-muted">{description}</p>
          {action && <div className="mt-6 flex flex-wrap gap-3">{action}</div>}
        </div>
      </div>
      {steps && (
        <ol className="grid gap-6 border-t border-border bg-raised p-6 sm:grid-cols-3 sm:p-8">
          {steps.map((step, index) => (
            <li key={step.title} className="flex min-w-0 gap-3">
              <span aria-hidden="true" className="font-meta pt-0.5 text-xs font-semibold text-accent">{String(index + 1).padStart(2, "0")}</span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">{step.title}</h3>
                <p className="ui-pretty mt-1 text-sm leading-6 text-fg-subtle">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
