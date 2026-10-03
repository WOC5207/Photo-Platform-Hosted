"use client";

import { useEffect, useRef, type ReactNode } from "react";

export default function DisclosureSection({
  title,
  description,
  summary,
  defaultOpen = false,
  desktopOpen = false,
  children,
  className = ""
}: {
  title: string;
  description?: string;
  summary?: string;
  defaultOpen?: boolean;
  desktopOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (!desktopOpen) return;
    const media = window.matchMedia("(min-width: 1024px)");
    const sync = () => {
      if (detailsRef.current) {
        detailsRef.current.open = media.matches || defaultOpen;
      }
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [defaultOpen, desktopOpen]);

  return (
    <details
      ref={detailsRef}
      open={defaultOpen}
      className={`group rounded-xl border border-border bg-surface ${className}`}
    >
      <summary
        className={`${desktopOpen ? "lg:hidden" : ""} flex min-h-14 list-none items-center justify-between gap-4 px-4 py-3 sm:px-5`}
      >
        <span className="min-w-0">
          <span className="block font-display text-xl font-semibold tracking-[-0.02em] text-fg">
            {title}
          </span>
          {(summary || description) && (
            <span className="mt-0.5 block text-xs leading-5 text-fg-subtle">
              {summary || description}
            </span>
          )}
        </span>
        <span
          aria-hidden="true"
          className="font-meta shrink-0 text-lg text-accent transition-transform group-open:rotate-45"
        >
          +
        </span>
      </summary>
      <div
        className={`${desktopOpen ? "hidden group-open:block lg:block" : ""} border-t border-border p-4 sm:p-5`}
      >
        {description && desktopOpen && (
          <p className="mb-5 text-sm leading-6 text-fg-subtle">{description}</p>
        )}
        {children}
      </div>
    </details>
  );
}
