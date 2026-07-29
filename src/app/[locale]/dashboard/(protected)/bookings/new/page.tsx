import { getLocale, getTranslations } from "next-intl/server";
import BookingEventForm from "@/components/admin/BookingEventForm";
import { Link } from "@/i18n/navigation";
import { createBookingEvent } from "../actions";
import { requireUser } from "@/lib/auth";
import { getSiteSettings } from "@/lib/settings";

export default async function NewBookingEventPage() {
  const t = await getTranslations("adminBookings");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  const user = await requireUser(locale);
  const settings = await getSiteSettings(user.id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/dashboard/bookings"
          className="mb-2 inline-flex min-h-10 items-center text-sm text-fg-subtle underline-offset-4 hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/20"
        >
          {tc("back")} · {t("listTitle")}
        </Link>
        <h1 className="font-display text-3xl font-semibold tracking-[-0.03em]">{t("newEvent")}</h1>
      </div>
      <BookingEventForm
        action={createBookingEvent}
        submitLabel={tc("create")}
        showOpenToggle={false}
        cancelHref="/dashboard/bookings"
        timeZone={settings.timeZone}
        initial={{
          titleEn: "",
          titleZh: "",
          dates: [],
          location: "",
          descriptionEn: "",
          descriptionZh: "",
          open: false
        }}
      />
    </div>
  );
}
