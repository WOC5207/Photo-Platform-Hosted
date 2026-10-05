import { getLocale, getTranslations } from "next-intl/server";
import PostersScreen from "@/components/album3d/studio/PostersScreen";
import { requireStudioUser } from "@/lib/studio3d";
import { loadStudioPosters } from "@/lib/studioSite3d";

export const dynamic = "force-dynamic";

export default async function StudioPostersPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const locale = await getLocale();
  const [user, t] = await Promise.all([requireStudioUser(username, locale), getTranslations("sharingPosters")]);
  return <PostersScreen posters={await loadStudioPosters(user, locale, t("ratioAdaptive"))} />;
}
