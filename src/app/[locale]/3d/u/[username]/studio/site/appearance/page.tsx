import { getLocale, getTranslations } from "next-intl/server";
import AppearanceScreen from "@/components/album3d/studio/AppearanceScreen";
import { requireStudioUser } from "@/lib/studio3d";
import { loadStudioSite } from "@/lib/studioSite3d";

export const dynamic = "force-dynamic";

export default async function StudioAppearancePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const locale = await getLocale();
  const [user, t] = await Promise.all([requireStudioUser(username, locale), getTranslations("common")]);
  return <AppearanceScreen site={await loadStudioSite(user, locale, t("creditTerm"))} />;
}
