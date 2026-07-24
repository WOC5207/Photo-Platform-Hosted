import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/auth";
import ManagementShell, {
  type ManagementNavItem
} from "@/components/management/ManagementShell";
import { getSiteSettings, resolveSiteTitle } from "@/lib/settings";
import { siteImageUrl } from "@/lib/images";
import { ownerBasePath, ownerName } from "@/lib/owner";
import { logout } from "../../login/actions";

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
  const user = await requireAdmin(locale);
  const t = await getTranslations();
  const settings = await getSiteSettings(user.id);
  const siteTitle = resolveSiteTitle(settings, locale, t("common.siteName"));
  const navigation: ManagementNavItem[] = [
    {
      href: "/admin",
      label: t("platform.usersTitle"),
      icon: "accounts",
      exact: true,
      activePrefixes: ["/admin/accounts"]
    },
    {
      href: "/admin/invites",
      label: t("platform.invitesTitle"),
      icon: "invites"
    },
    {
      href: "/admin/tiers",
      label: t("admin.storagePlans"),
      icon: "tiers"
    },
    {
      href: "/admin/notifications",
      label: t("adminNotifications.navTitle"),
      icon: "notifications"
    },
    {
      href: "/admin/moderation",
      label: t("adminModeration.navTitle"),
      icon: "moderation"
    },
    {
      href: "/admin/storage",
      label: t("admin.platformHealth"),
      icon: "health"
    }
  ];

  return (
    <ManagementShell
      workspace="platform"
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
      logoUrl={siteImageUrl(settings.logo)}
      publicSiteHref={ownerBasePath(user.username)}
      isAdmin
      logoutAction={logout}
    >
      {children}
    </ManagementShell>
  );
}
