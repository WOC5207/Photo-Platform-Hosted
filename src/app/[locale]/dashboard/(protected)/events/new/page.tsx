import { getTranslations } from "next-intl/server";
import EventForm from "@/components/admin/EventForm";
import { Link } from "@/i18n/navigation";
import { createEvent } from "../actions";

export default async function NewEventPage() {
  const t = await getTranslations("adminEvents");
  const tc = await getTranslations("common");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/dashboard/events"
          className="mb-2 inline-flex min-h-10 items-center text-sm text-fg-subtle underline-offset-4 hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/20"
        >
          {tc("back")} · {t("listTitle")}
        </Link>
        <h1 className="font-display text-3xl font-semibold tracking-[-0.03em]">{t("newEvent")}</h1>
      </div>
      <EventForm
        action={createEvent}
        submitLabel={tc("create")}
        cancelHref="/dashboard/events"
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
