import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import EquipmentItemScreen from "@/components/album3d/studio/EquipmentItemScreen";
import { requireStudioUser } from "@/lib/studio3d";
import { loadStudioCategories, loadStudioGear } from "@/lib/studioGear3d";

export const dynamic = "force-dynamic";

export default async function StudioGearPage({ params }: { params: Promise<{ username: string; id: string }> }) {
  const { username, id } = await params;
  const user = await requireStudioUser(username, await getLocale());
  const [gear, categories] = await Promise.all([loadStudioGear(user, id), loadStudioCategories(user)]);
  if (!gear) notFound();
  return <EquipmentItemScreen key={gear.id} gear={gear} categories={categories} />;
}
