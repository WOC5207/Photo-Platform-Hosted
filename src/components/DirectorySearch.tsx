"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export interface DirectoryOwner {
  username: string;
  name: string;
  logoUrl: string;
  thumbUrl: string;
  albumCount: number;
  photoCount: number;
}

/**
 * The photographer grid, filtered as you type.
 *
 * Filtered on the client because the directory is the whole (small) list of
 * accounts on one NAS — a round-trip per keystroke would buy nothing. If this
 * ever outgrows that, it becomes a search endpoint like the credit search.
 */
export default function DirectorySearch({ owners }: { owners: DirectoryOwner[] }) {
  const t = useTranslations("directory");
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return owners;
    return owners.filter(
      (o) =>
        o.name.toLowerCase().includes(q) || o.username.toLowerCase().includes(q)
    );
  }, [owners, query]);

  return (
    <div className="flex flex-col gap-6">
      <label className="flex w-full max-w-md flex-col gap-1.5 text-sm font-medium text-fg-muted">
        <span>{t("searchPlaceholder")}</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="min-h-12 w-full rounded-lg border border-border-strong bg-control px-4 py-2.5 text-sm outline-none transition-[border-color,background-color,box-shadow] hover:border-fg-faint focus-visible:border-accent/60 focus-visible:bg-raised focus-visible:ring-2 focus-visible:ring-accent/20"
        />
      </label>

      {matches.length === 0 ? (
        <p className="py-16 text-center text-fg-subtle">{t("noMatches")}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {matches.map((o, index) => (
            <li key={o.username}>
              <Link
                href={`/u/${o.username}`}
                className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-surface transition-[border-color,background-color,transform] hover:-translate-y-0.5 hover:border-accent/30 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                <div className="aspect-[3/2] w-full overflow-hidden bg-fg/5">
                  {o.thumbUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={o.thumbUrl}
                      alt=""
                      className="ui-image-frame h-full w-full object-cover transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:scale-[1.025]"
                    />
                  )}
                </div>
                <div className="flex flex-1 items-center gap-3 p-4">
                  <span className="font-meta text-[0.625rem] font-semibold tracking-[0.14em] text-accent">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {o.logoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={o.logoUrl}
                      alt=""
                      className="ui-image-frame h-9 w-9 shrink-0 rounded-md object-cover"
                    />
                  )}
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-semibold">{o.name}</span>
                    <span className="truncate text-xs text-fg-subtle">
                      {t("albums", { count: o.albumCount })} ·{" "}
                      {t("photos", { count: o.photoCount })}
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
