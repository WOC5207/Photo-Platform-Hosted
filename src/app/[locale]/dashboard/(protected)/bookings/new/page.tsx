import { getTranslations } from "next-intl/server";
import BookingEventForm from "@/components/admin/BookingEventForm";
import { createBookingEvent } from "../actions";

export default async function NewBookingEventPage() {
  const t = await getTranslations("adminBookings");
  const tc = await getTranslations("common");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{t("newEvent")}</h1>
      <BookingEventForm
        action={createBookingEvent}
        submitLabel={tc("create")}
        initial={{
          titleEn: "",
          titleZh: "",
          date: "",
          location: "",
          descriptionEn: "",
          descriptionZh: "",
          open: true
        }}
      />
    </div>
  );
}
