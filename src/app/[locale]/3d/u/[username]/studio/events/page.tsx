import { getLocale } from "next-intl/server";
import EventsScreen from "@/components/album3d/studio/EventsScreen";
import { loadStudioEvents, requireStudioUser, studioAccount } from "@/lib/studio3d";

export const dynamic = "force-dynamic";

export default async function StudioEventsPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const locale = await getLocale();
  const user = await requireStudioUser(username, locale);
  return <EventsScreen account={studioAccount(user)} events={await loadStudioEvents(user, locale)} />;
}
