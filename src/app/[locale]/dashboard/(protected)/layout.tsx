import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

// Auth depends on the request cookie — never prerender dashboard pages.
export const dynamic = "force-dynamic";
import { requireUser } from "@/lib/auth";
import { Link } from "@/i18n/navigation";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import { getSiteSettings, resolveCreditTerm, resolveSiteTitle } from "@/lib/settings";
import { siteImageUrl } from "@/lib/images";
import { ownerBasePath } from "@/lib/owner";
import { logout } from "../../login/actions";

/**
 * "My site" — every account's own admin area, not just the platform admin's.
 *
 * requireUser, not requireAdmin: this is where a photographer manages their own
 * albums and bookings, and every action beneath it is already scoped to the
 * signed-in owner. The platform admin's tools (accounts, invites) live under
 * /admin instead, which is the only place role still matters.
 */
export default async function DashboardLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const user = await requireUser(locale);

  const t = await getTranslations();
  const settings = await getSiteSettings(user.id);
  if (!settings.setupCompleted) redirect(`/${locale}/dashboard/setup`);
  const logoUrl = siteImageUrl(settings.logo);
  const siteTitle = resolveSiteTitle(settings, locale, t("common.siteName"));
  const creditTerm = resolveCreditTerm(settings, locale, t("common.creditTerm"));

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex flex-wrap items-center gap-4">
            <Link
              href={ownerBasePath(user.username)}
              aria-label={t("common.backToHome")}
              className="flex shrink-0 items-center"
            >
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" className="h-8 w-auto" />
              ) : (
                <span className="text-lg font-semibold tracking-wide">
                  {siteTitle}
                </span>
              )}
            </Link>
            <nav className="flex flex-wrap items-center gap-4 text-sm">
              <Link href="/dashboard" className="font-semibold">
                {t("admin.dashboard")}
              </Link>
              <Link
                href="/dashboard/events"
                className="text-fg-muted hover:text-fg"
              >
                {t("admin.events")}
              </Link>
              {settings.bookingEnabled && (
                <Link
                  href="/dashboard/bookings"
                  className="text-fg-muted hover:text-fg"
                >
                  {t("admin.bookings")}
                </Link>
              )}
              {settings.creditProfilesEnabled && (
                <Link
                  href="/dashboard/credits"
                  className="text-fg-muted hover:text-fg"
                >
                  {t("admin.credits", { term: creditTerm })}
                </Link>
              )}
              <Link
                href="/dashboard/settings"
                className="text-fg-muted hover:text-fg"
              >
                {t("admin.site")}
              </Link>
              <Link
                href="/dashboard/storage"
                className="text-fg-muted hover:text-fg"
              >
                {t("admin.resourceMonitor")}
              </Link>
              <Link
                href="/dashboard/account"
                className="text-fg-muted hover:text-fg"
              >
                {t("admin.account")}
              </Link>
              {/* Platform tools. Only the admin has these, and they are about
                  other people's accounts rather than this user's own site —
                  which is exactly why they are not part of the dashboard.
                  Styled like its neighbours: being a different shape made it
                  read as a mode switch rather than one more section. */}
              {user.role === "admin" && (
                <Link href="/admin" className="text-fg-muted hover:text-fg">
                  {t("admin.platform")}
                </Link>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <ThemeToggle label={t("common.toggleTheme")} />
            <form action={logout}>
              <button
                type="submit"
                className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-fg-muted hover:border-fg-faint hover:text-fg"
              >
                {t("auth.logout")}
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {children}
      </main>
    </div>
  );
}
