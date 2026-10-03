import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import PlatformThemeScope from "@/components/PlatformThemeScope";
import ArchiveSite from "@/components/album3d/ArchiveSite";
import { loadArchive } from "@/lib/archive3d";

// Lists live accounts and albums, and the palette comes from the database.
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
  const { files, columns } = await loadArchive(await getLocale());
  return (
    <PlatformThemeScope>
      <ArchiveSite files={files} columns={columns}>
        {children}
      </ArchiveSite>
    </PlatformThemeScope>
  );
}
