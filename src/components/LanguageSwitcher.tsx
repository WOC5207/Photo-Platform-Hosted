"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
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
  const t = useTranslations("languageSwitcher");
  const [hash, setHash] = useState("");
  const query = searchParams.toString();
  useEffect(() => setHash(window.location.hash), [pathname, query]);
  const suffix = `${query ? `?${query}` : ""}${hash}`;
  const href = `${pathname}${suffix}`;

  return (
    <span role="group" aria-label={t("label")} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border-strong bg-control p-1 text-sm">
      {routing.locales.map((locale) => (
          <Link
            key={locale}
            href={href}
            locale={locale}
            lang={locale === "zh" ? "zh-Hans" : "en"}
            aria-label={locale === "zh" ? "中文" : "English"}
            aria-current={locale === current ? "page" : undefined}
            className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-2 transition-colors ${
              locale === current
                ? "bg-raised font-semibold text-fg"
                : "text-fg-subtle hover:bg-raised hover:text-fg"
            }`}
          >
            {LABELS[locale]}
          </Link>
      ))}
    </span>
  );
}
