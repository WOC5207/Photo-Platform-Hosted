import { getLocale, getTranslations } from "next-intl/server";
import SiteContactScreen from "@/components/album3d/studio/SiteContactScreen";
import { requireStudioUser } from "@/lib/studio3d";
import { loadStudioSite } from "@/lib/studioSite3d";

export const dynamic = "force-dynamic";

export default async function StudioSiteContactPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const locale = await getLocale();
  const [user, t] = await Promise.all([requireStudioUser(username, locale), getTranslations("common")]);
  return <SiteContactScreen site={await loadStudioSite(user, locale, t("creditTerm"))} />;
}
