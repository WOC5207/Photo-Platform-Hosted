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
      className="flex flex-wrap gap-1 rounded-xl border border-border bg-surface p-1 sm:flex-nowrap sm:overflow-x-auto"
    >
      {items.map((item) => {
        const selected = item.id === active;
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={selected ? "page" : undefined}
            className={`inline-flex min-h-11 shrink-0 items-center rounded-lg px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40 ${
              selected
                ? "bg-page text-fg shadow-sm"
                : "text-fg-muted hover:bg-page/60 hover:text-fg"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
