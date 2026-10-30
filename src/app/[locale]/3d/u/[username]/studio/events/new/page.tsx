import { getLocale } from "next-intl/server";
import NewEventScreen from "@/components/album3d/studio/NewEventScreen";
import { requireStudioUser } from "@/lib/studio3d";

export const dynamic = "force-dynamic";

export default async function StudioNewEventPage({
  params,
  searchParams
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ then?: string }>;
}) {
  const { username } = await params;
  await requireStudioUser(username, await getLocale());
  // ?then=upload: opened from "Upload photos", so the new event's upload follows.
  return <NewEventScreen forUpload={(await searchParams).then === "upload"} />;
}
