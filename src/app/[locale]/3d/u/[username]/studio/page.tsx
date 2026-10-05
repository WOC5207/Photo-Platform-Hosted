import { getLocale, getTranslations } from "next-intl/server";
import HomeScreen from "@/components/album3d/studio/HomeScreen";
import { loadStudioHome, requireStudioUser } from "@/lib/studio3d";

// The signed-in photographer's own numbers.
export const dynamic = "force-dynamic";

export default async function StudioHomePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const locale = await getLocale();
  const user = await requireStudioUser(username, locale);
  const tc = await getTranslations("common");
  return <HomeScreen home={await loadStudioHome(user, locale, tc("creditTerm"))} />;
}
