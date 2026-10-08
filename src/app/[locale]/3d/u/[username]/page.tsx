import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import OverviewScreen from "@/components/album3d/studio/OverviewScreen";
import { archiveHasScreen } from "@/lib/archive3d";
import { getCurrentUser } from "@/lib/auth";
import { loadOwnerOverview } from "@/lib/studio3d";

// The signed-in photographer's own numbers.
export const dynamic = "force-dynamic";

/**
 * The /3d layout draws a photographer's screen from the address. On their
 * own, where "My archive" lands, the photographer also gets their overview
 * (see ArchiveSite, which leaves the panel to it there). Without a published
 * album the archive has no page for them yet, and the address answers 404.
 */
export default async function ThreeDScreen({ params }: { params: Promise<{ username: string }> }) {
  const [{ username }, user] = await Promise.all([params, getCurrentUser()]);
  if (!(await archiveHasScreen({ username }))) notFound();
  if (!user || user.username !== decodeURIComponent(username)) return null;
  return <OverviewScreen overview={await loadOwnerOverview(user, await getLocale())} />;
}
