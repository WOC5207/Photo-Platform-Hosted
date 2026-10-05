import { getLocale } from "next-intl/server";
import NewEventScreen from "@/components/album3d/studio/NewEventScreen";
import { requireStudioUser } from "@/lib/studio3d";

export const dynamic = "force-dynamic";

export default async function StudioNewEventPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  await requireStudioUser(username, await getLocale());
  return <NewEventScreen />;
}
