import { getLocale } from "next-intl/server";
import ContactScreen from "@/components/album3d/studio/ContactScreen";
import { requireStudioUser, studioAccount } from "@/lib/studio3d";
import { loadStudioGearContact } from "@/lib/studioGear3d";

export const dynamic = "force-dynamic";

export default async function StudioContactPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const user = await requireStudioUser(username, await getLocale());
  return <ContactScreen name={studioAccount(user).name} contact={await loadStudioGearContact(user)} />;
}
