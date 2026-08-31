import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

// Auth depends on the request cookie — never prerender dashboard pages.
export const dynamic = "force-dynamic";
import { getCurrentUser, requireUser } from "@/lib/auth";
import ManagementShell, {
  type ManagementNavItem
} from "@/components/management/ManagementShell";
import { getSiteSettings, resolveCreditTerm, resolveSiteTitle } from "@/lib/settings";
import { siteImageUrl } from "@/lib/images";
import { ownerBasePath, ownerName } from "@/lib/owner";
import { getActiveNotificationsForUser } from "@/lib/platformNotifications";
import PlatformNoticeBanner from "@/components/dashboard/PlatformNoticeBanner";
import { logout } from "../../login/actions";

/** Use the photographer's site title in the browser tab when configured. */
export async function generateMetadata({
  params
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const [user, t] = await Promise.all([
    getCurrentUser(),
    getTranslations({ locale, namespace: "common" })
  ]);
  if (!user) return { title: t("siteName") };

  const settings = await getSiteSettings(user.id);
  return { title: resolveSiteTitle(settings, locale, t("siteName")) };
}

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
  // Invited photographers still get the guided first-run setup. Platform
  // admins manage the same values directly from the dashboard and should not
  // be forced through onboarding.
  if (user.role !== "admin" && !settings.setupCompleted) {
    redirect(`/${locale}/dashboard/setup`);
  }
  // Platform-admin messages for this account. Fetched in the layout so the
  // banner shows on every management screen, not just the Overview entry.
  const platformNotifications = await getActiveNotificationsForUser(user.id);
  const logoUrl = siteImageUrl(settings.logo);
  const siteTitle = resolveSiteTitle(settings, locale, t("common.siteName"));
  const creditTerm = resolveCreditTerm(settings, locale, t("common.creditTerm"));
  const navigation: ManagementNavItem[] = [
    {
      href: "/dashboard",
      label: t("admin.overview"),
      icon: "overview",
      exact: true
    },
    {
      href: "/dashboard/events",
      label: t("admin.events"),
      icon: "gallery"
    },
    {
      href: "/dashboard/bookings",
      label: t("admin.bookings"),
      icon: "bookings"
    },
    {
      href: "/dashboard/equipment",
      label: t("admin.equipment"),
      icon: "equipment"
    },
    {
      href: "/dashboard/credits",
      label: t("admin.credits", { term: creditTerm }),
      icon: "credits"
    },
    {
      href: "/dashboard/settings",
      label: t("admin.site"),
      icon: "settings"
    },
    {
      href: "/dashboard/storage",
      label: t("admin.myStorage"),
      icon: "storage"
    }
  ];

  return (
    <ManagementShell
      workspace="site"
      navigation={navigation}
      labels={{
        workspaceSite: t("admin.mySite"),
        workspacePlatform: t("admin.platformAdmin"),
        account: t("admin.account"),
        viewSite: t("platform.viewSite"),
        directory: t("nav.directory"),
        language: t("languageSwitcher.label"),
        theme: t("common.toggleTheme"),
        logout: t("auth.logout"),
        menu: t("nav.menu"),
        close: t("common.close")
      }}
      username={user.username}
      displayName={ownerName(user)}
      siteTitle={siteTitle}
      logoUrl={logoUrl}
      publicSiteHref={ownerBasePath(user.username)}
      isAdmin={user.role === "admin"}
      logoutAction={logout}
    >
      <PlatformNoticeBanner
        notifications={platformNotifications}
        locale={locale}
      />
      {children}
    </ManagementShell>
  );
}
