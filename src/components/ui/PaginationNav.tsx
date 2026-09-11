import { Link } from "@/i18n/navigation";
import { buttonClasses } from "@/components/ui/Button";

export default function PaginationNav({
  page,
  totalPages,
  path,
  labels
}: {
  page: number;
  totalPages: number;
  path: string;
  labels: { navigation: string; previous: string; next: string; count: string };
}) {
  if (totalPages <= 1) return null;
  const href = (value: number) => `${path}?page=${value}`;
  return (
    <nav aria-label={labels.navigation} className="flex items-center justify-between gap-3 border-t border-border pt-4">
      {page > 1 ? <Link href={href(page - 1)} className={buttonClasses({ size: "compact" })}>{labels.previous}</Link> : <span />}
      <span className="font-meta text-xs text-fg-subtle">{labels.count}</span>
      {page < totalPages ? <Link href={href(page + 1)} className={buttonClasses({ size: "compact" })}>{labels.next}</Link> : <span />}
    </nav>
  );
}
