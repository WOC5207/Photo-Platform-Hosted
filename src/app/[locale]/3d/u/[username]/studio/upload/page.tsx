import { getLocale } from "next-intl/server";
import UploadPickScreen from "@/components/album3d/studio/UploadPickScreen";
import { loadStudioEvents, requireStudioUser, studioAccount } from "@/lib/studio3d";

export const dynamic = "force-dynamic";

export default async function StudioUploadPickPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const locale = await getLocale();
  const user = await requireStudioUser(username, locale);
  return <UploadPickScreen account={studioAccount(user)} events={await loadStudioEvents(user, locale)} />;
}
