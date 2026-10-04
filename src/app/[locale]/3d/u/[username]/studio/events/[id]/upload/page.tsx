import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import UploadScreen from "@/components/album3d/studio/UploadScreen";
import { config } from "@/lib/config";
import { prisma } from "@/lib/db";
import { pendingPhotoValue } from "@/lib/pendingPhotos";
import { getPlatformSettings } from "@/lib/platformSettings";
import { getCreditProfiles, getSiteSettings, resolveCreditTerm, resolveSubjectTerm } from "@/lib/settings";
import { loadStudioEvent, loadStudioPhotos, requireStudioUser, studioAccount } from "@/lib/studio3d";

export const dynamic = "force-dynamic";

export default async function StudioUploadPage({ params }: { params: Promise<{ username: string; id: string }> }) {
  const { username, id } = await params;
  const locale = await getLocale();
  const user = await requireStudioUser(username, locale);
  const [event, photos, pending, settings, platform, profiles, tc] = await Promise.all([
    loadStudioEvent(user, id, locale),
    loadStudioPhotos(user, id),
    prisma.photo.findMany({
      where: { eventId: id, event: { ownerId: user.id }, pendingBatchId: { not: null } },
      orderBy: { createdAt: "asc" }
    }),
    getSiteSettings(user.id),
    getPlatformSettings(),
    getCreditProfiles(user.id),
    getTranslations("common")
  ]);
  if (!event) notFound();
  return (
    <UploadScreen
      account={studioAccount(user)}
      event={event}
      photos={photos}
      wizard={{
        eventId: event.id,
        initialPendingPhotos: pending.map(pendingPhotoValue),
        allowOriginal: !config.stripOriginalExif(),
        uploadMaxBytes: config.uploadMaxBytes(),
        creditProfiles: profiles.map((c) => ({
          creditName: c.creditName,
          socialLinks: c.socialLinks.map((s) => ({ platform: s.platform, url: s.url }))
        })),
        creditTerm: resolveCreditTerm(settings, locale, tc("creditTerm")),
        subjectTerm: resolveSubjectTerm(settings, locale, tc("subjectTerm")),
        moderationEnabled: platform.moderationEnabled
      }}
    />
  );
}
