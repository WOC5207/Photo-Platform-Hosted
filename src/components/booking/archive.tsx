import type { ReactNode } from "react";
import { metaLabel } from "./classes";
import styles from "./Archive.module.css";

/**
 * The classic booking pages' frame, in the 3D booking screens' layout: the
 * heading panel on the left (on top, on phones) and the board or form beside
 * it. No hooks, so both the server pages and the booking form use it.
 */
export function ArchivePage({ aside, children }: { aside: ReactNode; children: ReactNode }) {
  return (
    <div
      className={`${styles.page} mx-auto grid w-full max-w-6xl gap-10 border border-border bg-page/90 px-5 py-7 sm:px-8 sm:py-10 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-14 lg:px-12 lg:py-12`}
    >
      <div className={`${styles.rise} min-w-0 lg:sticky lg:top-24 lg:self-start`}>{aside}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Crumbs, the heavy title, a meta line and the rule, as on the 3D panels. */
export function ArchiveHeading({
  crumbs,
  title,
  meta,
  as: Title = "h1"
}: {
  crumbs: ReactNode[];
  title: ReactNode;
  meta?: ReactNode;
  as?: "h1" | "h2";
}) {
  return (
    <div>
      <p className={metaLabel}>
        {crumbs.map((crumb, i) => (
          <span key={i}>
            {i > 0 && (
              <span aria-hidden="true" className="mx-2">
                ／
              </span>
            )}
            {crumb}
          </span>
        ))}
      </p>
      <Title className="mt-3 text-[2.25rem] font-extrabold uppercase leading-[0.95] tracking-[-0.04em] [:lang(zh)_&]:leading-[1.1] [overflow-wrap:anywhere] sm:text-[2.75rem]">
        {title}
      </Title>
      {meta && <p className="font-meta mt-3 text-[0.6875rem] uppercase leading-5 tracking-[0.12em] text-fg-subtle">{meta}</p>}
      <div aria-hidden="true" className={styles.rule} />
    </div>
  );
}

/** Seats left as the board's row of squares: filled while open, hollow once taken. */
export function SeatPips({ left, total }: { left: number; total: number }) {
  const shown = Math.min(16, Math.max(left, total));
  if (shown <= 0) return null;
  return (
    <span aria-hidden="true" className="flex flex-wrap gap-[3px]">
      {Array.from({ length: shown }, (_, i) => (
        <span key={i} className={`h-2 w-2 ${i < left ? "bg-accent" : "border border-fg-faint"}`} />
      ))}
    </span>
  );
}

/** Times on these pages are the event's local time. */
export function LocalTimeRule({ marker, children }: { marker: string; children: ReactNode }) {
  return (
    <p role="note" className="border-l-2 border-accent pl-3 text-xs leading-5 text-fg-muted">
      <span className="font-meta mr-2 text-[0.625rem] font-semibold tracking-[0.14em] text-fg">{marker}</span>
      {children}
    </p>
  );
}
