import { getLocale } from "next-intl/server";
import OverviewScreen from "@/components/album3d/studio/OverviewScreen";
import { getCurrentUser } from "@/lib/auth";
import { loadOwnerOverview } from "@/lib/studio3d";

// The signed-in photographer's own numbers.
export const dynamic = "force-dynamic";

/**
 * The /3d layout draws a photographer's screen from the address. On their
 * own, where "My archive" lands, the photographer also gets their overview
 * (see ArchiveSite, which leaves the panel to it there).
 */
export default async function ThreeDScreen({ params }: { params: Promise<{ username: string }> }) {
  const [{ username }, user] = await Promise.all([params, getCurrentUser()]);
  if (!user || user.username !== decodeURIComponent(username)) return null;
  const overview = await loadOwnerOverview(user, await getLocale());
  // Without a published album the archive has no page for them yet.
  return overview.albums > 0 ? <OverviewScreen overview={overview} /> : null;
}
