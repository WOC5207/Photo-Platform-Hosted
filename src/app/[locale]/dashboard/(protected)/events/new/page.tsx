import { getTranslations } from "next-intl/server";
import EventForm from "@/components/admin/EventForm";
import { createEvent } from "../actions";

export default async function NewEventPage() {
  const t = await getTranslations("adminEvents");
  const tc = await getTranslations("common");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{t("newEvent")}</h1>
      <EventForm
        action={createEvent}
        submitLabel={tc("create")}
        initial={{
          titleEn: "",
          titleZh: "",
          slug: "",
          dateStart: "",
          dateEnd: "",
          location: "",
          descriptionEn: "",
          descriptionZh: "",
          published: false
        }}
      />
    </div>
  );
}
