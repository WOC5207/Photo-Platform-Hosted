import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/auth";
import { Link } from "@/i18n/navigation";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeToggle from "@/components/ThemeToggle";

// Auth depends on the request cookie — never prerender.
export const dynamic = "force-dynamic";

/**
 * Platform administration: other people's accounts and the invites that create
 * them. Deliberately separate from /dashboard, which is "my site" for whoever
 * is signed in — including the admin, whose own photography lives there like
 * anyone else's.
 *
 * This is the only part of the app where role still decides anything.
 */
export default async function PlatformAdminLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireAdmin(locale);
  const t = await getTranslations();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <nav className="flex flex-wrap items-center gap-4 text-sm">
            <span className="font-semibold">{t("admin.platform")}</span>
            <Link href="/admin" className="text-fg-muted hover:text-fg">
              {t("platform.usersTitle")}
            </Link>
            <Link href="/admin/invites" className="text-fg-muted hover:text-fg">
              {t("platform.invitesTitle")}
            </Link>
            <Link href="/admin/tiers" className="text-fg-muted hover:text-fg">
              {t("adminTiers.title")}
            </Link>
            <Link href="/admin/storage" className="text-fg-muted hover:text-fg">
              {t("adminStorage.title")}
            </Link>
          </nav>
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <ThemeToggle label={t("common.toggleTheme")} />
            <Link
              href="/dashboard"
              className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-fg-muted hover:border-fg-faint hover:text-fg"
            >
              {t("admin.dashboard")}
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
