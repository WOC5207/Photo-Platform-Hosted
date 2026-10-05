import { getLocale, getTranslations } from "next-intl/server";
import HomepageScreen from "@/components/album3d/studio/HomepageScreen";
import { requireStudioUser } from "@/lib/studio3d";
import { loadStudioSite } from "@/lib/studioSite3d";

export const dynamic = "force-dynamic";

export default async function StudioHomepagePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const locale = await getLocale();
  const [user, t] = await Promise.all([requireStudioUser(username, locale), getTranslations("common")]);
  return <HomepageScreen site={await loadStudioSite(user, locale, t("creditTerm"))} />;
}
