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
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <Heading
          className={
            as === "h2" ? "text-lg font-semibold" : "text-sm font-semibold"
          }
        >
          {title}
        </Heading>
        {description && (
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-fg-subtle">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
