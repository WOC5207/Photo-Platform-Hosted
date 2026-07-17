"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
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
  owner,
  locale,
  labels,
  className
}: {
  /** Whose site is being searched — the API has no path to infer it from. */
  owner: string;
  locale: string;
  labels: HomeSearchLabels;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CreditSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const listboxId = useId();
  const statusId = useId();
  const router = useRouter();

  const trimmedQuery = query.trim();

  useEffect(() => {
    if (trimmedQuery.length === 0) {
      setResults(null);
      setSearching(false);
      setActiveIndex(-1);
      return;
    }
    setSearching(true);
    const handle = setTimeout(() => {
      fetch(
        `/api/search/credits?owner=${encodeURIComponent(owner)}&q=${encodeURIComponent(trimmedQuery)}`
      )
        .then((res) => res.json())
        .then((data) => {
          setResults(data.results ?? []);
          setActiveIndex(-1);
        })
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [trimmedQuery, owner]);

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
  const activeResult =
    activeIndex >= 0 && results ? results[activeIndex] : undefined;

  function resultHref(result: CreditSearchResult) {
    return `/u/${owner}/gallery/${result.eventSlug}?photo=${encodeURIComponent(result.photoId)}`;
  }

  return (
    <div ref={searchRef} className={`relative ${className ?? ""}`}>
      <label
        htmlFor={inputId}
        className="mb-1.5 block text-xs font-medium text-fg-subtle"
      >
        {labels.placeholder}
      </label>
      <svg
        viewBox="0 0 24 24"
        className="pointer-events-none absolute bottom-3.5 left-4 h-4 w-4 text-fg-faint"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="11" cy="11" r="7" />
        <path strokeLinecap="round" d="M21 21l-4.3-4.3" />
      </svg>
      <input
        id={inputId}
        type="search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showDropdown}
        aria-controls={showDropdown ? listboxId : undefined}
        aria-activedescendant={
          activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
        }
        aria-describedby={statusId}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (!showDropdown || !results?.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((i) => (i + 1) % results.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
          } else if (e.key === "Enter" && activeResult) {
            e.preventDefault();
            setQuery("");
            router.push(resultHref(activeResult));
          }
        }}
        placeholder={labels.placeholder}
        className="min-h-11 w-full rounded-full border border-border-strong bg-surface py-3 pl-11 pr-4 text-sm text-fg outline-none transition focus-visible:border-fg-subtle focus-visible:ring-2 focus-visible:ring-fg/20"
      />
      <span id={statusId} role="status" aria-live="polite" className="sr-only">
        {searching
          ? labels.searching
          : results
            ? results.length > 0
              ? `${results.length}`
              : labels.noResults
            : ""}
      </span>
      {showDropdown && (
        <div
          id={listboxId}
          className="absolute inset-x-0 top-full z-20 mt-2 max-h-80 overflow-y-auto rounded-xl border border-fg/10 bg-page shadow-2xl"
        >
          {searching ? (
            <p className="p-3 text-sm text-fg-subtle">{labels.searching}</p>
          ) : results && results.length > 0 ? (
            <ul
              role="listbox"
              className="flex flex-col divide-y divide-fg/5"
            >
              {results.map((r, index) => (
                <li
                  key={`${r.photoId}-${r.creditName}-${r.subject}`}
                  id={`${listboxId}-option-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                >
                  <Link
                    href={resultHref(r)}
                    onClick={() => setQuery("")}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={`flex items-center gap-3 p-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-fg/40 ${
                      index === activeIndex ? "bg-fg/5" : "hover:bg-fg/5"
                    }`}
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
