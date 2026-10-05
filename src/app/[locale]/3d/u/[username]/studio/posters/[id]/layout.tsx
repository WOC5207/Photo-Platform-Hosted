import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import SharepostStudioProvider from "@/components/album3d/creators/sharepost/SharepostStudio";
import { requireStudioUser } from "@/lib/studio3d";
import { loadStudioPoster } from "@/lib/studioSite3d";

export const dynamic = "force-dynamic";

/**
 * A saved poster in the 3D Sharepost editor. The steps below share this
 * layout's draft, as /3d/sharepost's do, but it saves to the project.
 */
export default async function StudioPosterLayout({ params, children }: { params: Promise<{ username: string; id: string }>; children: React.ReactNode }) {
  const { username, id } = await params;
  const locale = await getLocale();
  const project = await loadStudioPoster(await requireStudioUser(username, locale), locale, id);
  if (!project) notFound();
  return <SharepostStudioProvider project={project}>{children}</SharepostStudioProvider>;
}
