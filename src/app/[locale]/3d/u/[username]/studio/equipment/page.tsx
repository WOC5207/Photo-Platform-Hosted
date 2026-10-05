import { getLocale } from "next-intl/server";
import EquipmentScreen from "@/components/album3d/studio/EquipmentScreen";
import { requireStudioUser } from "@/lib/studio3d";
import { loadStudioEquipment } from "@/lib/studioGear3d";

export const dynamic = "force-dynamic";

export default async function StudioEquipmentPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const user = await requireStudioUser(username, await getLocale());
  return <EquipmentScreen equipment={await loadStudioEquipment(user)} />;
}
