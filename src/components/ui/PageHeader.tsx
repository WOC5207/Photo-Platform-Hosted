import type { ReactNode } from "react";

export default function PageHeader({
  title,
  description,
  action,
  index = "01"
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  index?: string;
}) {
  return (
    <header className="flex flex-col gap-5 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 gap-4">
        <span
          aria-hidden="true"
          className="font-meta mt-1 text-[0.6875rem] font-semibold tracking-[0.18em] text-accent"
        >
          {index}
        </span>
        <div className="min-w-0">
          <h1 className="font-display ui-balance text-[2rem] font-semibold leading-[1.08] tracking-[-0.035em] text-fg sm:text-[2.5rem]">
            {title}
          </h1>
          {description && (
            <p className="ui-pretty mt-2 max-w-3xl text-sm leading-6 text-fg-subtle">
              {description}
            </p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0 sm:pb-0.5">{action}</div>}
    </header>
  );
}
