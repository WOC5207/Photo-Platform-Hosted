import { getLocale } from "next-intl/server";
import LabelsScreen from "@/components/album3d/studio/LabelsScreen";
import { requireStudioUser, studioAccount } from "@/lib/studio3d";
import { loadStudioLabels } from "@/lib/studioGear3d";

export const dynamic = "force-dynamic";

export default async function StudioLabelsPage({
  params,
  searchParams
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ selected?: string | string[] }>;
}) {
  const [{ username }, query] = await Promise.all([params, searchParams]);
  const user = await requireStudioUser(username, await getLocale());
  const labels = await loadStudioLabels(user, [query.selected ?? []].flat());
  return <LabelsScreen account={studioAccount(user)} labels={labels} />;
}
