import { getLocale, getTranslations } from "next-intl/server";
import StorageScreen from "@/components/album3d/studio/StorageScreen";
import { requireStudioUser } from "@/lib/studio3d";
import { loadStudioStorage } from "@/lib/studioSite3d";

export const dynamic = "force-dynamic";

export default async function StudioStoragePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const locale = await getLocale();
  const [user, t] = await Promise.all([requireStudioUser(username, locale), getTranslations("adminStorage")]);
  return <StorageScreen storage={await loadStudioStorage(user, locale, t("untitledEvent"))} />;
}
