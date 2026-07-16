import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import SiteChrome from "@/components/SiteChrome";
import { findOwner, ownerName, resolveOwner } from "@/lib/owner";
import { getSiteSettings, resolveSiteTitle } from "@/lib/settings";

// Resolves the owner from the request path — never prerender.
export const dynamic = "force-dynamic";

/** This photographer's own title, overriding the platform default. */
export async function generateMetadata({
  params
}: {
  params: Promise<{ locale: string; username: string }>;
}): Promise<Metadata> {
  const { locale, username } = await params;
  const owner = await findOwner(username);
  if (!owner) return {};

  const t = await getTranslations({ locale, namespace: "common" });
  const settings = await getSiteSettings(owner.id);
  return {
    title: resolveSiteTitle(settings, locale, ownerName(owner) || t("siteName"))
  };
}

/**
 * One photographer's public site. The [username] segment is the only place an
 * owner is named for these routes, and resolveOwner is the only thing that
 * reads it — so pointing subdomains here later is a middleware rewrite
 * (alice.pinhaoshe.ca/gallery -> /u/alice/gallery) and nothing below changes.
 *
 * 404s for an unknown or suspended username, which also takes a suspended
 * account's public site down immediately rather than just locking them out.
 */
export default async function OwnerSiteLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const owner = await resolveOwner(username);
  return <SiteChrome owner={owner}>{children}</SiteChrome>;
}
