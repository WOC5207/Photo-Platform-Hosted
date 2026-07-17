import { getTranslations, getLocale } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { Link } from "@/i18n/navigation";
import { getSiteSettings, resolveCreditTerm } from "@/lib/settings";

export default async function AdminDashboardPage() {
  const t = await getTranslations("admin");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  const user = await requireUser(locale);
  const settings = await getSiteSettings(user.id);
  const creditTerm = resolveCreditTerm(settings, locale, tc("creditTerm"));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{t("dashboard")}</h1>
        <p className="mt-1 text-fg-subtle">{t("welcome")}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/dashboard/events"
          className="rounded-xl border border-border bg-surface p-6 transition hover:border-border-strong"
        >
          <h2 className="text-lg font-semibold">{t("events")}</h2>
          <p className="mt-1 text-sm text-fg-subtle">
            {t("eventsCardHint")}
          </p>
        </Link>
        {settings.bookingEnabled && (
          <Link
            href="/dashboard/bookings"
            className="rounded-xl border border-border bg-surface p-6 transition hover:border-border-strong"
          >
            <h2 className="text-lg font-semibold">{t("bookings")}</h2>
            <p className="mt-1 text-sm text-fg-subtle">
              {t("bookingsCardHint")}
            </p>
          </Link>
        )}
        {settings.creditProfilesEnabled && (
          <Link
            href="/dashboard/credits"
            className="rounded-xl border border-border bg-surface p-6 transition hover:border-border-strong"
          >
            <h2 className="text-lg font-semibold">{t("credits", { term: creditTerm })}</h2>
            <p className="mt-1 text-sm text-fg-subtle">
              {t("creditsCardHint")}
            </p>
          </Link>
        )}
        <Link
          href="/dashboard/settings"
          className="rounded-xl border border-border bg-surface p-6 transition hover:border-border-strong"
        >
          <h2 className="text-lg font-semibold">{t("site")}</h2>
          <p className="mt-1 text-sm text-fg-subtle">{t("siteCardHint")}</p>
        </Link>
        <Link
          href="/dashboard/storage"
          className="rounded-xl border border-border bg-surface p-6 transition hover:border-border-strong"
        >
          <h2 className="text-lg font-semibold">{t("resourceMonitor")}</h2>
          <p className="mt-1 text-sm text-fg-subtle">
            {t("resourceMonitorCardHint")}
          </p>
        </Link>
        <Link
          href="/dashboard/account"
          className="rounded-xl border border-border bg-surface p-6 transition hover:border-border-strong"
        >
          <h2 className="text-lg font-semibold">{t("account")}</h2>
          <p className="mt-1 text-sm text-fg-subtle">{t("accountCardHint")}</p>
        </Link>
      </div>
    </div>
  );
}
