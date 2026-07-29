import { Link } from "@/i18n/navigation";

export interface TabItem {
  id: string;
  label: string;
  href: string;
}

export default function Tabs({
  items,
  active,
  label
}: {
  items: TabItem[];
  active: string;
  label: string;
}) {
  return (
    <nav
      aria-label={label}
      className="flex flex-wrap gap-1 border-b border-border sm:flex-nowrap sm:overflow-x-auto"
    >
      {items.map((item) => {
        const selected = item.id === active;
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={selected ? "page" : undefined}
            className={`relative inline-flex min-h-11 shrink-0 items-center px-3 py-2 text-sm font-semibold transition-[color,background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
              selected
                ? "text-fg after:absolute after:inset-x-3 after:bottom-[-1px] after:h-0.5 after:bg-accent"
                : "text-fg-subtle hover:bg-accent-surface hover:text-fg"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
