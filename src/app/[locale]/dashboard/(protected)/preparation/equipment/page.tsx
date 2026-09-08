import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import EventWorkspaceHeader from "@/components/events/EventWorkspaceHeader";
import { buttonClasses } from "@/components/ui/Button";
import { controlClasses } from "@/components/ui/Field";
import SectionHeading from "@/components/ui/SectionHeading";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth";
import { pickText } from "@/lib/content";
import { prisma } from "@/lib/db";
import PreparationHeader from "../PreparationHeader";
import { createChecklist } from "../actions";

function formatShootDate(value: Date | null, locale: string): string {
  if (!value) return "";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(value);
}

export default async function PreparationEquipmentPage({
  searchParams
}: {
  searchParams: Promise<{ event?: string }>;
}) {
  const locale = await getLocale();
  const user = await requireUser(locale);
  const [t, tp] = await Promise.all([
    getTranslations("equipment"),
    getTranslations("preparation")
  ]);
  const { event: eventId } = await searchParams;
  const event = eventId
    ? await prisma.bookingEvent.findFirst({
        where: { id: eventId, ownerId: user.id },
        include: { galleryEvent: { where: { ownerId: user.id } } }
      })
    : null;
  if (eventId && !event) notFound();

  const checklists = await prisma.equipmentChecklist.findMany({
    where: {
      ownerId: user.id,
      ...(event ? { bookingDay: { bookingEventId: event.id } } : {})
    },
    orderBy: [{ shootDate: "asc" }, { createdAt: "desc" }],
    include: {
      _count: { select: { items: true } }
    }
  });

  return (
    <div className="flex flex-col gap-8">
      {event ? (
        <EventWorkspaceHeader
          title={pickText(
            locale,
            (event.galleryEvent ?? event).titleEn,
            (event.galleryEvent ?? event).titleZh
          )}
          galleryId={event.galleryEvent?.id}
          bookingId={event.id}
          active="equipment"
        />
      ) : (
        <PreparationHeader active="equipment" />
      )}

      <Link
        href="/dashboard/equipment"
        className={buttonClasses({ size: "compact", className: "self-start" })}
      >
        {t("inventoryTitle")}
      </Link>

      {!event && (
        <details className="ui-panel p-5 sm:p-6">
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-accent">
            {tp("standalone")}
          </summary>
          <section className="max-w-2xl pt-4">
            <h2 className="font-display text-xl font-semibold">{t("createChecklist")}</h2>
            <p className="mt-1 text-sm text-fg-subtle">{t("createChecklistHint")}</p>
            <form action={createChecklist} className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm">
                <span className="font-semibold text-fg-muted">{t("checklistName")}</span>
                <input name="name" required maxLength={160} className={controlClasses} />
              </label>
              <label className="flex flex-col gap-2 text-sm">
                <span className="font-semibold text-fg-muted">{t("shootDate")}</span>
                <input name="shootDate" type="date" className={controlClasses} />
              </label>
              <label className="flex flex-col gap-2 text-sm sm:col-span-2">
                <span className="font-semibold text-fg-muted">{t("notes")}</span>
                <textarea name="notes" rows={3} maxLength={1000} className={controlClasses} />
              </label>
              <button
                type="submit"
                className={buttonClasses({
                  variant: "primary",
                  className: "sm:col-span-2 sm:justify-self-start"
                })}
              >
                {t("createChecklistButton")}
              </button>
            </form>
          </section>
        </details>
      )}

      <section className="flex flex-col gap-4">
        <SectionHeading title={t("checklistsTitle")} description={t("checklistsHint")} />
        {checklists.length === 0 ? (
          <p className="ui-panel flex min-h-32 items-center justify-center p-6 text-center text-sm text-fg-subtle">
            {t("emptyChecklists")}
          </p>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {checklists.map((checklist, index) => {
              return (
                <li key={checklist.id} className="ui-panel flex min-w-0 flex-col gap-4 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <span className="font-meta text-[0.6875rem] font-semibold tracking-[0.14em] text-accent">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <h3 className="mt-2 break-words font-display text-xl font-semibold">
                        {checklist.name}
                      </h3>
                      <p className="mt-1 text-xs text-fg-subtle">
                        {checklist.shootDate
                          ? formatShootDate(checklist.shootDate, locale)
                          : t("noShootDate")}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-control px-3 py-1 text-xs font-semibold tabular-nums text-fg-muted">
                      {t("itemCount", { count: checklist._count.items })}
                    </span>
                  </div>
                  {checklist.notes && (
                    <p className="line-clamp-2 whitespace-pre-wrap text-sm text-fg-muted">{checklist.notes}</p>
                  )}
                  <Link
                    href={`/dashboard/preparation/equipment/${checklist.id}`}
                    className={buttonClasses({ variant: "primary", className: "mt-auto" })}
                  >
                    {t("openChecklist")}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
