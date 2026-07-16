import { notFound } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { photoUrls } from "@/lib/images";
import { formatShutterSpeedInput } from "@/lib/exif";
import {
  getCreditProfiles,
  getSiteSettings,
  resolveCreditTerm,
  resolveSubjectTerm
} from "@/lib/settings";
import { Link } from "@/i18n/navigation";
import EventForm from "@/components/admin/EventForm";
import PhotoUploader from "@/components/admin/PhotoUploader";
import PhotoManager, { type AdminPhoto } from "@/components/admin/PhotoManager";
import ConfirmSubmit from "@/components/admin/ConfirmSubmit";
import { deleteEvent, updateEvent } from "../actions";

export default async function EditEventPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("adminEvents");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  const user = await requireUser(locale);
  const settings = await getSiteSettings(user.id);
  const creditTerm = resolveCreditTerm(settings, locale, tc("creditTerm"));
  const subjectTerm = resolveSubjectTerm(settings, locale, tc("subjectTerm"));

  const event = await prisma.event.findFirst({
    where: { id, ownerId: user.id },
    include: {
      photos: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          credits: {
            orderBy: { sortOrder: "asc" },
            include: { socialLinks: { orderBy: { sortOrder: "asc" } } }
          }
        }
      }
    }
  });
  if (!event) notFound();

  const creditProfiles = (await getCreditProfiles(user.id)).map((c) => ({
    creditName: c.creditName,
    socialLinks: c.socialLinks.map((s) => ({ platform: s.platform, url: s.url }))
  }));

  const photos: AdminPhoto[] = event.photos.map((p) => ({
    id: p.id,
    thumbUrl: photoUrls(event.id, p.id).thumb,
    credits: p.credits.map((c) => ({
      creditName: c.creditName,
      subject: c.subject,
      socialLinks: c.socialLinks.map((s) => ({ platform: s.platform, url: s.url }))
    })),
    isCover: event.coverPhotoId === p.id,
    homeHighlight: p.homeHighlight,
    exif: {
      focalLengthMm: p.exifFocalLengthMm?.toString() ?? "",
      aperture: p.exifAperture?.toString() ?? "",
      exposureTime: formatShutterSpeedInput(p.exifExposureTime),
      iso: p.exifIso?.toString() ?? "",
      takenAt: p.exifTakenAt ? p.exifTakenAt.toISOString().slice(0, 10) : "",
      cameraModel: p.exifCameraModel ?? "",
      lensModel: p.exifLensModel ?? ""
    }
  }));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("editEvent")}</h1>
        <div className="flex items-center gap-3">
          {event.published && (
            <Link
              href={`/gallery/${event.slug}`}
              className="text-sm text-fg-subtle underline hover:text-fg"
            >
              {t("viewPublic")}
            </Link>
          )}
          <DeleteEventButton
            id={event.id}
            label={t("deleteEvent")}
            confirmText={t("confirmDeleteEvent")}
          />
        </div>
      </div>

      <EventForm
        action={updateEvent}
        submitLabel={tc("save")}
        initial={{
          id: event.id,
          titleEn: event.titleEn,
          titleZh: event.titleZh,
          slug: event.slug,
          dateStart: event.dateStart ? event.dateStart.toISOString().slice(0, 10) : "",
          dateEnd: event.dateEnd ? event.dateEnd.toISOString().slice(0, 10) : "",
          location: event.location,
          descriptionEn: event.descriptionEn,
          descriptionZh: event.descriptionZh,
          published: event.published
        }}
      />

      <section className="flex flex-col gap-4 border-t border-border pt-6">
        <h2 className="text-xl font-semibold">{t("photos")}</h2>
        <PhotoUploader
          eventId={event.id}
          creditProfiles={creditProfiles}
          creditTerm={creditTerm}
          subjectTerm={subjectTerm}
        />
        <PhotoManager
          photos={photos}
          creditProfiles={creditProfiles}
          creditTerm={creditTerm}
          subjectTerm={subjectTerm}
        />
      </section>
    </div>
  );
}

function DeleteEventButton({
  id,
  label,
  confirmText
}: {
  id: string;
  label: string;
  confirmText: string;
}) {
  return (
    <form action={deleteEvent}>
      <input type="hidden" name="id" value={id} />
      <ConfirmSubmit label={label} confirmText={confirmText} />
    </form>
  );
}
