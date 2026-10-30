import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import PlatformThemeScope from "@/components/PlatformThemeScope";
import ArchiveSite from "@/components/album3d/ArchiveSite";
import { loadArchive, loadOwnerPalettes, loadRecentAlbums } from "@/lib/archive3d";
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
  const locale = await getLocale();
  const [{ files, columns, recent }, palettes, user] = await Promise.all([
    // The recently updated albums eject from the field, so it always holds them.
    loadRecentAlbums(locale).then(async (recent) => ({ ...(await loadArchive(locale, recent.map((album) => album.id))), recent })),
    loadOwnerPalettes(),
    getCurrentUser()
  ]);
  return (
    <PlatformThemeScope>
      <ArchiveSite
        files={files}
        columns={columns}
        recent={recent}
        palettes={palettes}
        viewer={user ? { username: user.username, name: ownerName(user), admin: user.role === "admin" } : null}
      >
        {children}
      </ArchiveSite>
    </PlatformThemeScope>
  );
}
