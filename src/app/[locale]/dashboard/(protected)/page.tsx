import { getTranslations, getLocale } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { Link } from "@/i18n/navigation";
import { getSiteSettings, resolveCreditTerm } from "@/lib/settings";
import PageHeader from "@/components/ui/PageHeader";

export default async function AdminDashboardPage() {
  const t = await getTranslations("admin");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  const user = await requireUser(locale);
  const settings = await getSiteSettings(user.id);
  const creditTerm = resolveCreditTerm(settings, locale, tc("creditTerm"));
  const destinations = [
    {
      href: "/dashboard/events",
      title: t("events"),
      hint: t("eventsCardHint")
    },
    {
      href: "/dashboard/bookings",
      title: t("bookings"),
      hint: t("bookingsCardHint")
    },
    {
      href: "/dashboard/equipment",
      title: t("equipment"),
      hint: t("equipmentCardHint")
    },
    ...(settings.creditProfilesEnabled
      ? [
          {
            href: "/dashboard/credits",
            title: t("credits", { term: creditTerm }),
            hint: t("creditsCardHint")
          }
        ]
      : []),
    {
      href: "/dashboard/settings",
      title: t("site"),
      hint: t("siteCardHint")
    },
    {
      href: "/dashboard/storage",
      title: t("myStorage"),
      hint: t("resourceMonitorCardHint")
    }
  ];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t("dashboard")} description={t("welcome")} />
      <ol className="grid gap-3 md:grid-cols-2">
        {destinations.map((destination, index) => (
          <li
            key={destination.href}
            className={index === 0 ? "md:col-span-2" : ""}
          >
          <Link
            href={destination.href}
            className={`group flex h-full items-start justify-between gap-5 rounded-xl border border-border bg-surface p-5 transition-[border-color,background-color,transform] duration-150 hover:border-accent/30 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
              index === 0 ? "min-h-40 sm:p-7" : "min-h-32"
            }`}
          >
            <div className="flex min-w-0 gap-4">
              <span className="font-meta mt-1 text-[0.6875rem] font-semibold tracking-[0.14em] text-accent">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h2
                  className={
                    index === 0
                      ? "font-display text-2xl font-semibold tracking-[-0.025em] sm:text-3xl"
                      : "text-base font-semibold"
                  }
                >
                  {destination.title}
                </h2>
                <p className="ui-pretty mt-2 max-w-2xl text-sm leading-6 text-fg-subtle">
                  {destination.hint}
                </p>
              </div>
            </div>
            <span
              aria-hidden="true"
              className="mt-0.5 text-xl text-fg-faint transition-transform group-hover:translate-x-1 group-hover:text-accent"
            >
              →
            </span>
          </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
