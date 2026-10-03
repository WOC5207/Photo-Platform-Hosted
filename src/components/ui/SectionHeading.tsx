import type { ReactNode } from "react";

export default function SectionHeading({
  title,
  description,
  action,
  as = "h2"
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  as?: "h2" | "h3";
}) {
  const Heading = as;

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 gap-3">
        <span
          aria-hidden="true"
          className="mt-1 h-5 w-0.5 shrink-0 rounded-full bg-accent"
        />
        <div>
        <Heading
          className={
            as === "h2"
              ? "font-display ui-balance text-xl font-semibold leading-tight tracking-[-0.02em]"
              : "text-sm font-semibold tracking-[-0.01em]"
          }
        >
          {title}
        </Heading>
        {description && (
          <p className="ui-pretty mt-1 max-w-3xl text-xs leading-relaxed text-fg-subtle">
            {description}
          </p>
        )}
        </div>
      </div>
      {action}
    </div>
  );
}
