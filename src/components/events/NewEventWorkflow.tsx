import { getLocale, getTranslations } from "next-intl/server";
import BookingEventForm from "@/components/admin/BookingEventForm";
import { Link } from "@/i18n/navigation";
import { createBookingEvent } from "@/app/[locale]/dashboard/(protected)/bookings/actions";
import { requireUser } from "@/lib/auth";
import { getSiteSettings } from "@/lib/settings";
import { getPlatformSettings } from "@/lib/platformSettings";
import { pickText } from "@/lib/content";

export default async function NewEventWorkflow({ gallery }: { gallery?: { id: string; titleEn: string; titleZh: string; location: string; descriptionEn: string; descriptionZh: string; dateStart: Date | null } }) {
  const t = await getTranslations("eventWorkspace");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  const user = await requireUser(locale);
  const [settings, platformSettings] = await Promise.all([
    getSiteSettings(user.id),
    getPlatformSettings()
  ]);
  const bookingPriceNotice = {
    title: pickText(
      locale,
      platformSettings.bookingPriceNoticeTitleEn,
      platformSettings.bookingPriceNoticeTitleZh
    ),
    body: pickText(
      locale,
      platformSettings.bookingPriceNoticeBodyEn,
      platformSettings.bookingPriceNoticeBodyZh
    ),
    version: platformSettings.bookingPriceNoticeVersion
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/dashboard/events"
          className="mb-2 inline-flex min-h-10 items-center text-sm text-fg-subtle underline-offset-4 hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/20"
        >
          {tc("back")} · {t("listTitle")}
        </Link>
        <h1 className="font-display text-3xl font-semibold tracking-[-0.03em]">{gallery ? t("addBooking") : t("newEvent")}</h1>
      </div>
      <p className="max-w-3xl text-sm leading-6 text-fg-subtle">{gallery ? t("legacySetupHint") : t("createHint")}</p>
      <BookingEventForm
        action={createBookingEvent}
        submitLabel={tc("create")}
        showOpenToggle={false}
        cancelHref="/dashboard/events"
        timeZone={settings.timeZone}
        priceDisplay={{
          enabled: settings.bookingPriceEnabled,
          notice: bookingPriceNotice
        }}
        initial={{
          galleryEventId: gallery?.id,
          titleEn: gallery?.titleEn ?? "",
          titleZh: gallery?.titleZh ?? "",
          dates: gallery?.dateStart ? [gallery.dateStart.toISOString().slice(0, 10)] : [],
          location: gallery?.location ?? "",
          descriptionEn: gallery?.descriptionEn ?? "",
          descriptionZh: gallery?.descriptionZh ?? "",
          visitorEditsEnabled: false,
          visitorEditCutoffHours: 24,
          open: false
        }}
      />
    </div>
  );
}
