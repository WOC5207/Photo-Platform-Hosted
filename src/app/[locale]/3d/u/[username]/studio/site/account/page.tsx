import { getLocale, getTranslations } from "next-intl/server";
import AccountScreen from "@/components/album3d/studio/AccountScreen";
import { requireStudioUser } from "@/lib/studio3d";
import { loadStudioSite } from "@/lib/studioSite3d";

export const dynamic = "force-dynamic";

export default async function StudioAccountPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const locale = await getLocale();
  const [user, t] = await Promise.all([requireStudioUser(username, locale), getTranslations("common")]);
  return <AccountScreen site={await loadStudioSite(user, locale, t("creditTerm"))} />;
}
