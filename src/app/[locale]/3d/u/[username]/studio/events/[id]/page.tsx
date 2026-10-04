import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import EventScreen from "@/components/album3d/studio/EventScreen";
import { loadStudioEvent, loadStudioPhotos, requireStudioUser, studioAccount } from "@/lib/studio3d";

export const dynamic = "force-dynamic";

export default async function StudioEventPage({ params }: { params: Promise<{ username: string; id: string }> }) {
  const { username, id } = await params;
  const locale = await getLocale();
  const user = await requireStudioUser(username, locale);
  const [event, photos] = await Promise.all([loadStudioEvent(user, id, locale), loadStudioPhotos(user, id)]);
  if (!event) notFound();
  return <EventScreen account={studioAccount(user)} event={event} photos={photos} />;
}
