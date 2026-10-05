import { getLocale, getTranslations } from "next-intl/server";
import CreditsScreen from "@/components/album3d/studio/CreditsScreen";
import { requireStudioUser } from "@/lib/studio3d";
import { loadStudioCredits } from "@/lib/studioSite3d";

export const dynamic = "force-dynamic";

export default async function StudioCreditsPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const locale = await getLocale();
  const [user, t] = await Promise.all([requireStudioUser(username, locale), getTranslations("common")]);
  return <CreditsScreen credits={await loadStudioCredits(user, locale, t("creditTerm"))} />;
}
