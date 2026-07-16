import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

// Auth depends on the request cookie — never prerender admin pages.
export const dynamic = "force-dynamic";
import { requireAdmin } from "@/lib/auth";
import { Link } from "@/i18n/navigation";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import { getSiteSettings, resolveCreditTerm, resolveSiteTitle } from "@/lib/settings";
import { siteImageUrl } from "@/lib/images";
import { logout } from "../../login/actions";

export default async function AdminLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // Sends a signed-out visitor to the login page but a signed-in non-admin to
  // the public site — bouncing someone who is already authenticated back to a
  // login form tells them nothing and only loops.
  //
  // Still admin-only: this dashboard becomes every user's "my site" in the
  // routing phase, but until ordinary accounts have somewhere to live, the
  // admin is the only one with anything to manage here.
  const user = await requireAdmin(locale);

  const t = await getTranslations();
  const settings = await getSiteSettings(user.id);
  if (!settings.setupCompleted) redirect(`/${locale}/admin/setup`);
  const logoUrl = siteImageUrl(settings.logo);
  const siteTitle = resolveSiteTitle(settings, locale, t("common.siteName"));
  const creditTerm = resolveCreditTerm(settings, locale, t("common.creditTerm"));

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex flex-wrap items-center gap-4">
            <Link
              href="/"
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
              <Link href="/admin" className="font-semibold">
                {t("admin.dashboard")}
              </Link>
              <Link
                href="/admin/events"
                className="text-fg-muted hover:text-fg"
              >
                {t("admin.events")}
              </Link>
              {settings.bookingEnabled && (
                <Link
                  href="/admin/bookings"
                  className="text-fg-muted hover:text-fg"
                >
                  {t("admin.bookings")}
                </Link>
              )}
              {settings.creditProfilesEnabled && (
                <Link
                  href="/admin/credits"
                  className="text-fg-muted hover:text-fg"
                >
                  {t("admin.credits", { term: creditTerm })}
                </Link>
              )}
              <Link
                href="/admin/settings"
                className="text-fg-muted hover:text-fg"
              >
                {t("admin.site")}
              </Link>
              <Link
                href="/admin/storage"
                className="text-fg-muted hover:text-fg"
              >
                {t("admin.resourceMonitor")}
              </Link>
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
