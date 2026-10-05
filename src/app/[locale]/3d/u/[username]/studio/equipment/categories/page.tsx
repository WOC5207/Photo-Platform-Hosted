import { getLocale } from "next-intl/server";
import CategoriesScreen from "@/components/album3d/studio/CategoriesScreen";
import { requireStudioUser } from "@/lib/studio3d";
import { loadStudioCategories } from "@/lib/studioGear3d";

export const dynamic = "force-dynamic";

export default async function StudioCategoriesPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const user = await requireStudioUser(username, await getLocale());
  return <CategoriesScreen username={user.username} categories={await loadStudioCategories(user)} />;
}
