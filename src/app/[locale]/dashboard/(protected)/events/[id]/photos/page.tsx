import { notFound } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { photoUrls } from "@/lib/images";
import { config } from "@/lib/config";
import {
  getCreditProfiles,
  getSiteSettings,
  resolveCreditTerm,
  resolveSubjectTerm
} from "@/lib/settings";
import { pickText } from "@/lib/content";
import { Link } from "@/i18n/navigation";
import PhotoWizard from "@/components/admin/wizard/PhotoWizard";
import type { PendingPhotoValue } from "@/components/admin/wizard/usePendingUploadQueue";
import { getPlatformSettings } from "@/lib/platformSettings";

export default async function AddPhotosPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("adminEvents");
  const tw = await getTranslations("photoWizard");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  const user = await requireUser(locale);
  const settings = await getSiteSettings(user.id);
  const platformSettings = await getPlatformSettings();
  const creditTerm = resolveCreditTerm(settings, locale, tc("creditTerm"));
  const subjectTerm = resolveSubjectTerm(settings, locale, tc("subjectTerm"));

  const event = await prisma.event.findFirst({
    where: { id, ownerId: user.id },
    include: {
      photos: {
        where: { pendingBatchId: { not: null } },
        orderBy: { createdAt: "asc" }
      }
    }
  });
  if (!event) notFound();

  const creditProfiles = (await getCreditProfiles(user.id)).map((c) => ({
    creditName: c.creditName,
    socialLinks: c.socialLinks.map((s) => ({ platform: s.platform, url: s.url }))
  }));

  const pendingPhotos: PendingPhotoValue[] = event.photos.map((photo) => ({
    id: photo.id,
    name: photo.originalName,
    previewUrl: photoUrls(event.id, photo.id).thumb,
    state:
      photo.uploadState === "awaiting"
        ? "awaiting"
        : photo.uploadState === "processing" ||
            photo.uploadState === "finalizing"
          ? "processing"
          : photo.uploadState === "deleting"
            ? "deleting"
            : "pending",
    storagePreset:
      photo.storagePreset === "archive" || photo.storagePreset === "balanced"
        ? photo.storagePreset
        : "original",
    candidatePreset:
      photo.candidatePreset === "archive" || photo.candidatePreset === "balanced"
        ? photo.candidatePreset
        : null,
    width: photo.width,
    height: photo.height,
    sourceBytes: photo.sourceBytes,
    candidateBytes: photo.candidateBytes,
    renditionBytes: photo.renditionBytes,
    pendingBytes: photo.bytes,
    finalBytes:
      photo.renditionBytes != null &&
      (photo.storagePreset === "original"
        ? photo.sourceBytes != null
        : photo.candidateBytes != null)
        ? (photo.storagePreset === "original"
            ? photo.sourceBytes!
            : photo.candidateBytes!) + photo.renditionBytes
        : null,
    compressionFailed: photo.compressionFailed
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/dashboard/events/${event.id}`}
          className="mb-2 inline-flex min-h-10 items-center text-sm text-fg-subtle underline-offset-4 hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/20"
        >
          {tc("back")} · {t("editEvent")}
        </Link>
        <h1 className="font-display text-3xl font-semibold tracking-[-0.03em]">{tw("pageTitle")}</h1>
        <p className="mt-1 text-sm text-fg-subtle">
          {pickText(locale, event.titleEn, event.titleZh)}
        </p>
      </div>

      <PhotoWizard
        eventId={event.id}
        initialPendingPhotos={pendingPhotos}
        allowOriginal={!config.stripOriginalExif()}
        uploadMaxBytes={config.uploadMaxBytes()}
        creditProfiles={creditProfiles}
        creditTerm={creditTerm}
        subjectTerm={subjectTerm}
        moderationEnabled={platformSettings.moderationEnabled}
      />
    </div>
  );
}
