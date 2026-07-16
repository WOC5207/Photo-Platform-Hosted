import { getTranslations, getLocale } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { getOwnerStorage, formatBytes } from "@/lib/storage";
import { pickText } from "@/lib/content";

export default async function ResourceMonitorPage() {
  const t = await getTranslations("adminStorage");
  const locale = await getLocale();
  const user = await requireUser(locale);
  const stats = await getOwnerStorage(user.id);

  const overview = [
    { label: t("totalLabel"), bytes: stats.usedBytes, emphasize: true },
    { label: t("photosLabel"), bytes: stats.photosBytes, emphasize: false },
    { label: t("siteImagesLabel"), bytes: stats.siteImagesBytes, emphasize: false }
  ];

  const maxEventBytes = Math.max(1, ...stats.events.map((e) => e.bytes));

  // The quota bar is the point of this page now: a photographer needs to know
  // how much room is left before an upload fails, not just what they have used.
  const usedPct =
    stats.quotaBytes > 0
      ? Math.min(100, (stats.usedBytes / stats.quotaBytes) * 100)
      : 0;
  const remaining = Math.max(0, stats.quotaBytes - stats.usedBytes);
  const full = remaining === 0;
  const nearlyFull = !full && usedPct >= 90;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-fg-subtle">{t("intro")}</p>
      </div>

      <section className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">{t("quotaTitle")}</h2>
          <span className="text-sm text-fg-muted">
            {t("quotaUsed", {
              used: formatBytes(stats.usedBytes),
              total: formatBytes(stats.quotaBytes)
            })}
          </span>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-fg/10">
          <div
            className={`h-full rounded-full ${
              full ? "bg-danger" : nearlyFull ? "bg-amber-500" : "bg-fg/60"
            }`}
            style={{ width: `${usedPct}%` }}
          />
        </div>
        <p
          className={`mt-2 text-xs ${full || nearlyFull ? "text-danger" : "text-fg-subtle"}`}
        >
          {full
            ? t("quotaFull")
            : nearlyFull
              ? t("quotaNearlyFull")
              : t("quotaRemaining", { remaining: formatBytes(remaining) })}
        </p>
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        {overview.map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-border bg-surface p-4"
          >
            <p className="text-sm text-fg-subtle">{item.label}</p>
            <p
              className={
                item.emphasize
                  ? "mt-1 text-2xl font-bold"
                  : "mt-1 text-xl font-semibold"
              }
            >
              {formatBytes(item.bytes)}
            </p>
          </div>
        ))}
      </div>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t("eventsTitle")}</h2>
          <p className="-mt-1 text-xs text-fg-subtle">{t("eventsHint")}</p>
        </div>

        {stats.events.length === 0 ? (
          <p className="text-sm text-fg-subtle">{t("noEvents")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {stats.events.map((e) => {
              const title = pickText(locale, e.titleEn, e.titleZh) || t("untitledEvent");
              const shareOfPhotos =
                stats.photosBytes > 0 ? (e.bytes / stats.photosBytes) * 100 : 0;
              const barPct = (e.bytes / maxEventBytes) * 100;
              return (
                <li
                  key={e.id}
                  className="rounded-xl border border-border bg-surface p-3"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className="font-medium">{title}</span>
                    <span className="text-sm text-fg-muted">
                      {formatBytes(e.bytes)} · {t("photoCount", { count: e.photoCount })} ·{" "}
                      {t("shareOfPhotos", { pct: shareOfPhotos.toFixed(1) })}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-fg/10">
                    <div
                      className="h-full rounded-full bg-fg/60"
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
