import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import PlatformThemeScope from "@/components/PlatformThemeScope";
import ArchiveSite from "@/components/album3d/ArchiveSite";
import { loadArchive, loadOwnerPalettes } from "@/lib/archive3d";
import { getCurrentUser } from "@/lib/auth";
import { ownerName } from "@/lib/owner";

// Lists live accounts and albums, and the palettes come from the database.
export const dynamic = "force-dynamic";

// The classic pages are the canonical copies, so keep the 3D twins out of
// search results.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("album3d");
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

/**
 * The 3D site. The scene and its HUD live here rather than in the pages, so
 * moving between screens keeps one canvas and only changes the address; each
 * page under /3d exists to give a screen its URL (see lib/siteMode).
 */
export default async function ThreeDLayout({ children }: { children: React.ReactNode }) {
  const [{ files, columns }, palettes, user] = await Promise.all([loadArchive(await getLocale()), loadOwnerPalettes(), getCurrentUser()]);
  return (
    <PlatformThemeScope>
      <ArchiveSite files={files} columns={columns} palettes={palettes} viewer={user ? { username: user.username, name: ownerName(user) } : null}>
        {children}
      </ArchiveSite>
    </PlatformThemeScope>
  );
}
