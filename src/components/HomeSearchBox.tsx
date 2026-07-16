"use client";

import { useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { pickText, formatPhotoCredit } from "@/lib/content";
import type { CreditSearchResult } from "@/app/api/search/credits/route";

export interface HomeSearchLabels {
  placeholder: string;
  searching: string;
  noResults: string;
}

/**
 * Search-as-you-type over the credited-person/character info admins enter
 * per photo. Lives in the hero (next to the title) rather than inside the
 * highlights panel, so it needs its own client component rather than
 * being one more piece of HomeHighlightsPanel.
 */
export default function HomeSearchBox({
  locale,
  labels,
  className
}: {
  locale: string;
  labels: HomeSearchLabels;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CreditSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const trimmedQuery = query.trim();

  useEffect(() => {
    if (trimmedQuery.length === 0) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const handle = setTimeout(() => {
      fetch(`/api/search/credits?q=${encodeURIComponent(trimmedQuery)}`)
        .then((res) => res.json())
        .then((data) => setResults(data.results ?? []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [trimmedQuery]);

  useEffect(() => {
    if (trimmedQuery.length === 0) return;
    function onClickAway(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setQuery("");
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setQuery("");
    }
    document.addEventListener("click", onClickAway);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClickAway);
      window.removeEventListener("keydown", onKey);
    };
  }, [trimmedQuery]);

  const showDropdown = trimmedQuery.length > 0;

  return (
    <div ref={searchRef} className={`relative ${className ?? ""}`}>
      <svg
        viewBox="0 0 24 24"
        className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-faint"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="11" cy="11" r="7" />
        <path strokeLinecap="round" d="M21 21l-4.3-4.3" />
      </svg>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={labels.placeholder}
        className="w-full rounded-full border border-border-strong bg-surface py-3 pl-11 pr-4 text-sm text-fg outline-none focus:border-fg-subtle"
      />
      {showDropdown && (
        <div className="absolute inset-x-0 top-full z-20 mt-2 max-h-80 overflow-y-auto rounded-xl border border-fg/10 bg-page shadow-2xl">
          {searching ? (
            <p className="p-3 text-sm text-fg-subtle">{labels.searching}</p>
          ) : results && results.length > 0 ? (
            <ul className="flex flex-col divide-y divide-fg/5">
              {results.map((r) => (
                <li key={r.photoId}>
                  <Link
                    href={`/gallery/${r.eventSlug}`}
                    onClick={() => setQuery("")}
                    className="flex items-center gap-3 p-2 transition hover:bg-fg/5"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={r.thumbUrl}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-lg object-cover"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-fg">
                        {formatPhotoCredit(r.creditName, r.subject)}
                      </p>
                      <p className="truncate text-xs text-fg-subtle">
                        {pickText(locale, r.eventTitleEn, r.eventTitleZh)}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-3 text-sm text-fg-subtle">{labels.noResults}</p>
          )}
        </div>
      )}
    </div>
  );
}
