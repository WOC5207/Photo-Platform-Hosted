import { getLocale } from "next-intl/server";
import SlotSheetScreen from "@/components/album3d/studio/SlotSheetScreen";
import { requireStudioUser } from "@/lib/studio3d";
import { loadStudioSlotSheet } from "@/lib/studioGear3d";

export const dynamic = "force-dynamic";

export default async function StudioSlotSheetPage({
  params,
  searchParams
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ event?: string }>;
}) {
  const [{ username }, query, locale] = await Promise.all([params, searchParams, getLocale()]);
  const user = await requireStudioUser(username, locale);
  return <SlotSheetScreen sheet={await loadStudioSlotSheet(user, locale, query.event ?? null)} />;
}
