import { getLocale } from "next-intl/server";
import PreparationScreen from "@/components/album3d/studio/PreparationScreen";
import { requireStudioUser } from "@/lib/studio3d";
import { loadStudioPreparation } from "@/lib/studioGear3d";

export const dynamic = "force-dynamic";

export default async function StudioPreparationPage({
  params,
  searchParams
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ event?: string }>;
}) {
  const [{ username }, query, locale] = await Promise.all([params, searchParams, getLocale()]);
  const user = await requireStudioUser(username, locale);
  return <PreparationScreen preparation={await loadStudioPreparation(user, locale, query.event ?? null)} />;
}
