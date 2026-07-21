import { notFound } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { photoUrls } from "@/lib/images";
import { formatShutterSpeedInput } from "@/lib/exif";
import { ownerBasePath } from "@/lib/owner";
import {
  getCreditProfiles,
  getSiteSettings,
  resolveCreditTerm,
  resolveSubjectTerm
} from "@/lib/settings";
import { Link } from "@/i18n/navigation";
import EventForm from "@/components/admin/EventForm";
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

  const pendingCount = event.photos.filter(
    (photo) => photo.pendingBatchId !== null
  ).length;

  const photos: AdminPhoto[] = event.photos
    .filter((photo) => photo.pendingBatchId === null)
    .map((p) => ({
      id: p.id,
      thumbUrl: photoUrls(event.id, p.id).thumb,
      credits: p.credits.map((c) => ({
        creditName: c.creditName,
        subject: c.subject,
        socialLinks: c.socialLinks.map((s) => ({
          platform: s.platform,
          url: s.url
        }))
      })),
      comment: p.comment,
      isCover: event.coverPhotoId === p.id,
      homeHighlight: p.homeHighlight,
      exif: {
        focalLengthMm: p.exifFocalLengthMm?.toString() ?? "",
        aperture: p.exifAperture?.toString() ?? "",
        exposureTime: formatShutterSpeedInput(p.exifExposureTime),
        iso: p.exifIso?.toString() ?? "",
        takenAt: p.exifTakenAt
          ? p.exifTakenAt.toISOString().slice(0, 10)
          : "",
        cameraModel: p.exifCameraModel ?? "",
        lensModel: p.exifLensModel ?? ""
      }
    }));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link
            href="/dashboard/events"
            className="mb-2 inline-flex min-h-10 items-center text-sm text-fg-subtle underline-offset-4 hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/20"
          >
            {tc("back")} · {t("listTitle")}
          </Link>
          <h1 className="text-2xl font-bold">{t("editEvent")}</h1>
        </div>
        {event.published && (
          <Link
            href={`${ownerBasePath(user.username)}/gallery/${event.slug}`}
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border-strong px-4 py-2 text-sm font-semibold text-fg-muted transition hover:border-fg-subtle hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/20 max-sm:min-h-11"
          >
            {t("viewPublic")}
          </Link>
        )}
      </div>

      <EventForm
        action={updateEvent}
        submitLabel={tc("save")}
        cancelHref="/dashboard/events"
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

      <section
        id="photos"
        className="scroll-mt-6 flex flex-col gap-4 border-t border-border pt-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t("photos")}</h2>
          <Link
            href={`/dashboard/events/${event.id}/photos`}
            className="inline-flex min-h-10 items-center justify-center rounded-lg bg-fg px-4 py-2 text-sm font-semibold text-page transition hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40 max-sm:min-h-11"
          >
            {pendingCount > 0
              ? t("resumePhotos", { count: pendingCount })
              : `+ ${t("addPhotos")}`}
          </Link>
        </div>
        <PhotoManager
          photos={photos}
          creditProfiles={creditProfiles}
          creditTerm={creditTerm}
          subjectTerm={subjectTerm}
        />
      </section>

      <section className="rounded-xl border border-danger-border bg-danger-surface/40 p-5">
        <h2 className="text-lg font-semibold text-danger-strong">{tc("dangerZone")}</h2>
        <p className="mt-1 text-sm text-fg-subtle">{t("confirmDeleteEvent")}</p>
        <div className="mt-4">
          <DeleteEventButton
            id={event.id}
            label={t("deleteEvent")}
            confirmText={t("confirmDeleteEvent")}
          />
        </div>
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
