import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import PhotosScreen from "@/components/album3d/studio/PhotosScreen";
import { getCreditProfiles, getSiteSettings, resolveCreditTerm, resolveSubjectTerm } from "@/lib/settings";
import { loadStudioEvent, loadStudioPhotos, requireStudioUser, studioAccount } from "@/lib/studio3d";

export const dynamic = "force-dynamic";

export default async function StudioPhotosPage({ params }: { params: Promise<{ username: string; id: string }> }) {
  const { username, id } = await params;
  const locale = await getLocale();
  const user = await requireStudioUser(username, locale);
  const [event, photos, settings, profiles, tc] = await Promise.all([
    loadStudioEvent(user, id, locale),
    loadStudioPhotos(user, id),
    getSiteSettings(user.id),
    getCreditProfiles(user.id),
    getTranslations("common")
  ]);
  if (!event) notFound();
  return (
    <PhotosScreen
      account={studioAccount(user)}
      event={event}
      photos={photos}
      creditTerm={resolveCreditTerm(settings, locale, tc("creditTerm"))}
      subjectTerm={resolveSubjectTerm(settings, locale, tc("subjectTerm"))}
      knownCredits={profiles.map((p) => p.creditName)}
    />
  );
}
