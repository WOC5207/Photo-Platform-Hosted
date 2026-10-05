import { getLocale } from "next-intl/server";
import EquipmentNewScreen from "@/components/album3d/studio/EquipmentNewScreen";
import { requireStudioUser, studioAccount } from "@/lib/studio3d";
import { loadStudioCategories } from "@/lib/studioGear3d";

export const dynamic = "force-dynamic";

export default async function StudioEquipmentNewPage({
  params,
  searchParams
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ for?: string }>;
}) {
  const [{ username }, query] = await Promise.all([params, searchParams]);
  const user = await requireStudioUser(username, await getLocale());
  return <EquipmentNewScreen account={studioAccount(user)} categories={await loadStudioCategories(user)} forLabels={query.for === "labels"} />;
}
