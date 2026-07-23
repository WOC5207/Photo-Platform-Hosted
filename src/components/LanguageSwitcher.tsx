"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, usePathname } from "@/i18n/navigation";
import { routing, type AppLocale } from "@/i18n/routing";

const LABELS: Record<AppLocale, string> = {
  zh: "中文",
  en: "EN"
};

export default function LanguageSwitcher() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = useLocale();
  const [hash, setHash] = useState("");
  const query = searchParams.toString();
  useEffect(() => setHash(window.location.hash), [pathname, query]);
  const suffix = `${query ? `?${query}` : ""}${hash}`;
  const href = `${pathname}${suffix}`;

  return (
    <span className="inline-flex min-h-11 items-center gap-1 text-sm lg:min-h-10">
      {routing.locales.map((locale, i) => (
        <span key={locale} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-fg-faint">/</span>}
          <Link
            href={href}
            locale={locale}
            className={`inline-flex min-h-11 items-center px-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40 lg:min-h-10 ${
              locale === current
                ? "font-semibold text-fg"
                : "text-fg-subtle hover:text-fg"
            }`}
          >
            {LABELS[locale]}
          </Link>
        </span>
      ))}
    </span>
  );
}
