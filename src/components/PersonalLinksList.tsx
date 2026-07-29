export interface PersonalLinkItem {
  id: string;
  label: string;
  url: string;
}

/** Homepage sidebar card linking out to the photographer's other sites. */
export default function PersonalLinksList({
  items,
  title
}: {
  items: PersonalLinkItem[];
  title: string;
}) {
  if (items.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-surface/92 p-5">
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-fg-subtle">
        {title}
      </h3>
      <ul className="mt-3 flex flex-col divide-y divide-border">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-10 items-center justify-between gap-3 rounded-lg px-2 text-sm font-medium text-fg-muted transition hover:bg-accent-surface hover:text-fg"
            >
              {item.label}
              <span aria-hidden="true" className="text-fg-faint">↗</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
