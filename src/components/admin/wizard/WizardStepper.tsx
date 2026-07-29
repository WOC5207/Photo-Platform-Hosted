"use client";

export default function WizardStepper({
  steps,
  currentIndex,
  onStepClick,
  stepAriaLabel
}: {
  steps: { key: string; label: string }[];
  currentIndex: number;
  /** Only steps already visited (index < currentIndex) are clickable. */
  onStepClick: (index: number) => void;
  stepAriaLabel: (index: number, label: string) => string;
}) {
  return (
    <ol className="flex flex-wrap items-center gap-2 border-b border-border pb-4">
      {steps.map((step, index) => {
        const isCurrent = index === currentIndex;
        const isPast = index < currentIndex;
        return (
          <li key={step.key} className="flex items-center gap-2">
            {index > 0 && (
              <span aria-hidden="true" className="text-fg-faint">
                →
              </span>
            )}
            <button
              type="button"
              aria-current={isCurrent ? "step" : undefined}
              aria-label={stepAriaLabel(index, step.label)}
              disabled={!isPast}
              onClick={() => onStepClick(index)}
              className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 py-1 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                isCurrent
                  ? "bg-accent-surface text-accent-strong"
                  : isPast
                    ? "border border-border-strong bg-raised text-fg-muted hover:border-accent/30 hover:text-fg"
                    : "border border-border text-fg-subtle"
              } disabled:cursor-default`}
            >
              <span
                aria-hidden="true"
                className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                  isCurrent ? "bg-accent text-white dark:text-page" : "bg-control"
                }`}
              >
                {index + 1}
              </span>
              {step.label}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
