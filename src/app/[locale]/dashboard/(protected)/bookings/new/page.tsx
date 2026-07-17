import { getTranslations } from "next-intl/server";
import BookingEventForm from "@/components/admin/BookingEventForm";
import { Link } from "@/i18n/navigation";
import { createBookingEvent } from "../actions";

export default async function NewBookingEventPage() {
  const t = await getTranslations("adminBookings");
  const tc = await getTranslations("common");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/dashboard/bookings"
          className="mb-2 inline-flex min-h-10 items-center text-sm text-fg-subtle underline-offset-4 hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/20"
        >
          {tc("back")} · {t("listTitle")}
        </Link>
        <h1 className="text-2xl font-bold">{t("newEvent")}</h1>
      </div>
      <BookingEventForm
        action={createBookingEvent}
        submitLabel={tc("create")}
        showOpenToggle={false}
        cancelHref="/dashboard/bookings"
        initial={{
          titleEn: "",
          titleZh: "",
          date: "",
          location: "",
          descriptionEn: "",
          descriptionZh: "",
          open: false
        }}
      />
    </div>
  );
}
