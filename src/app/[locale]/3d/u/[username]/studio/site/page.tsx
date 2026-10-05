import { getLocale, getTranslations } from "next-intl/server";
import SiteScreen from "@/components/album3d/studio/SiteScreen";
import { requireStudioUser } from "@/lib/studio3d";
import { loadStudioSite } from "@/lib/studioSite3d";

export const dynamic = "force-dynamic";

export default async function StudioSitePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const locale = await getLocale();
  const [user, t] = await Promise.all([requireStudioUser(username, locale), getTranslations("common")]);
  return <SiteScreen site={await loadStudioSite(user, locale, t("creditTerm"))} />;
}
