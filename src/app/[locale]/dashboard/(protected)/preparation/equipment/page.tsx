import { notFound } from "next/navigation";
import EventWorkspaceHeader from "@/components/events/EventWorkspaceHeader";
import { getLocale, getTranslations } from "next-intl/server";
import ConfirmSubmit from "@/components/admin/ConfirmSubmit";
import { buttonClasses } from "@/components/ui/Button";
import { controlClasses as inputClasses } from "@/components/ui/Field";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { pickText } from "@/lib/content";
import EquipmentPicker from "../EquipmentPicker";
import PreparationHeader from "../PreparationHeader";
import SubmitButton from "../SubmitButton";
import { addCustomChecklistItem, createChecklist, createDailyEquipmentChecklist, deleteChecklist, removeChecklistItem, resetChecklist, toggleChecklistItem } from "../actions";

function formatShootDate(value: Date | null, locale: string): string {
  if (!value) return "";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(value);
}


export default async function PreparationEquipmentPage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  const locale = await getLocale();
  const user = await requireUser(locale);
  const t = await getTranslations("equipment");
  const tp = await getTranslations("preparation");
  const { event: eventId } = await searchParams;
  const event = eventId ? await prisma.bookingEvent.findFirst({ where: { id: eventId, ownerId: user.id }, include: { galleryEvent: { where: { ownerId: user.id } } } }) : null;
  if (eventId && !event) notFound();
  const [allEquipment, checklists] = await Promise.all([
    prisma.equipmentItem.findMany({
      where: { ownerId: user.id },
      orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
      include: { category: true }
    }),
    prisma.equipmentChecklist.findMany({
      where: { ownerId: user.id, ...(event ? { bookingDay: { bookingEventId: event.id } } : {}) },
      orderBy: [{ shootDate: "asc" }, { createdAt: "desc" }],
      include: {
        items: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          include: { equipment: true }
        }
      }
    })
  ]);

  const days = await prisma.bookingDay.findMany({
    where: { bookingEvent: { ownerId: user.id }, ...(event ? { bookingEventId: event.id } : {}) },
    include: { bookingEvent: true, equipmentChecklist: { select: { id: true } } },
    orderBy: { date: "asc" }
  });
  return (
    <div className="flex flex-col gap-8">
      {event ? <EventWorkspaceHeader title={pickText(locale, (event.galleryEvent ?? event).titleEn, (event.galleryEvent ?? event).titleZh)} galleryId={event.galleryEvent?.id} bookingId={event.id} active="equipment" /> : <PreparationHeader active="equipment" />}
      <section className="ui-panel flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-2xl font-semibold">{tp("dailyChecklist")}</h2>
          <Link href="/dashboard/equipment" className={buttonClasses({ size: "compact" })}>{t("inventoryTitle")}</Link>
        </div>
        <p className="text-sm text-fg-subtle">{tp("equipmentHint")}</p>
        {days.length ? <form action={createDailyEquipmentChecklist} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
            <span>{tp("eventDay")}</span>
            <select name="bookingDayId" required className={inputClasses} defaultValue="">
              <option value="" disabled>{tp("chooseDay")}</option>
              {days.map(day => <option key={day.id} value={day.id}>
                {pickText(locale, day.bookingEvent.titleEn, day.bookingEvent.titleZh)} · {day.date.toISOString().slice(0,10)}{day.equipmentChecklist ? " · " + tp("existing") : ""}
              </option>)}
            </select>
          </label>
          <SubmitButton primary>{tp("prepareDay")}</SubmitButton>
        </form> : <p className="text-sm text-fg-muted">{tp("noDays")}</p>}
      </section>
      {!event && <details className="ui-panel p-5 sm:p-6">
        <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-accent">{tp("standalone")}</summary>
      <div className="max-w-2xl">
        <section className="pt-4">
          <h2 className="font-display text-xl font-semibold">{t("createChecklist")}</h2>
          <p className="mt-1 text-sm text-fg-subtle">{t("createChecklistHint")}</p>
          <form action={createChecklist} className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-fg-muted">{t("checklistName")}</span>
              <input name="name" required maxLength={160} className={inputClasses} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-fg-muted">{t("shootDate")}</span>
              <input name="shootDate" type="date" className={inputClasses} />
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span className="text-fg-muted">{t("notes")}</span>
              <textarea name="notes" rows={3} maxLength={1000} className={inputClasses} />
            </label>
            <button type="submit" className={buttonClasses({ variant: "primary", className: "sm:col-span-2 sm:justify-self-start" })}>
              {t("createChecklistButton")}
            </button>
          </form>
        </section>
      </div>


      </details>}
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold">{t("checklistsTitle")}</h2>
          <p className="mt-1 text-sm text-fg-subtle">{t("checklistsHint")}</p>
        </div>
        {checklists.length === 0 ? (
          <p className="ui-panel flex min-h-32 items-center justify-center p-6 text-center text-sm text-fg-subtle">
            {t("emptyChecklists")}
          </p>
        ) : (
          <div className="grid gap-5 xl:grid-cols-2">
            {checklists.map((checklist) => {
              const completed = checklist.items.filter((item) => item.checked).length;
              const total = checklist.items.length;
              const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
              return (
                <article key={checklist.id} id={"checklist-" + checklist.id} className="ui-panel flex min-w-0 scroll-mt-20 flex-col gap-5 p-5 sm:p-6">
                  <header className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="break-words font-display text-xl font-semibold">{checklist.name}</h3>
                      <p className="mt-1 text-xs text-fg-subtle">
                        {checklist.shootDate
                          ? formatShootDate(checklist.shootDate, locale)
                          : t("noShootDate")}
                      </p>
                    </div>
                    <span role="status" className="rounded-full bg-control px-3 py-1 text-xs font-semibold tabular-nums text-fg-muted">
                      {t("progress", { completed, total })}
                    </span>
                  </header>
                  <div className="h-2 overflow-hidden rounded-full bg-control" aria-hidden="true">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
                  </div>
                  {checklist.notes && <p className="whitespace-pre-wrap text-sm text-fg-muted">{checklist.notes}</p>}

                  {total === 0 ? (
                    <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-fg-subtle">
                      {t("emptyChecklistItems")}
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {checklist.items.map((item) => (
                        <li key={item.id} className="flex items-center gap-2 rounded-lg border border-border bg-control p-2">
                          <form action={toggleChecklistItem} className="min-w-0 flex-1">
                            <input type="hidden" name="id" value={item.id} />
                            <input type="hidden" name="checked" value={String(!item.checked)} />
                            <button
                              type="submit"
                              role="checkbox"
                              aria-checked={item.checked}
                              className="flex min-h-11 w-full items-center gap-3 rounded-md p-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                            >
                              <span
                                aria-hidden="true"
                                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-xs ${
                                  item.checked
                                    ? "border-accent bg-accent text-accent-fg"
                                    : "border-border-strong bg-surface"
                                }`}
                              >
                                {item.checked ? "✓" : ""}
                              </span>
                              <span className={`min-w-0 flex-1 ${item.checked ? "text-fg-subtle line-through" : "text-fg"}`}>
                                {item.label}
                              </span>
                              {item.equipment && (
                                <span className="shrink-0 text-[0.625rem] font-semibold uppercase tracking-wide text-accent">
                                  {t("inventoryItem")}
                                </span>
                              )}
                            </button>
                          </form>
                          <form action={removeChecklistItem}>
                            <input type="hidden" name="id" value={item.id} />
                            <button type="submit" aria-label={t("removeItem", { name: item.label })} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-fg-subtle hover:bg-danger-surface hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40">
                              ×
                            </button>
                          </form>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="flex flex-col gap-3 border-t border-border pt-4">
                    <EquipmentPicker checklistId={checklist.id} equipment={allEquipment.map(item => ({ id: item.id, name: item.name, category: item.category.name }))} selectedIds={checklist.items.flatMap(item => item.equipmentId ? [item.equipmentId] : [])} />
                    <form action={addCustomChecklistItem} className="flex gap-2">
                      <input type="hidden" name="checklistId" value={checklist.id} />
                      <label className="sr-only" htmlFor={`custom-${checklist.id}`}>{t("customItem")}</label>
                      <input id={`custom-${checklist.id}`} name="label" required maxLength={200} placeholder={t("customItem")} className={inputClasses} />
                      <button type="submit" className={buttonClasses({ size: "compact" })}>{t("add")}</button>
                    </form>
                  </div>
                  <footer className="flex flex-wrap gap-2 border-t border-border pt-4">
                    <form action={resetChecklist}>
                      <input type="hidden" name="checklistId" value={checklist.id} />
                      <button type="submit" disabled={completed === 0} className={buttonClasses({ size: "compact" })}>
                        {t("resetChecklist")}
                      </button>
                    </form>
                    <form action={deleteChecklist}>
                      <input type="hidden" name="id" value={checklist.id} />
                      <ConfirmSubmit label={t("deleteChecklist")} confirmText={t("deleteChecklistConfirm", { name: checklist.name })} />
                    </form>
                  </footer>
                </article>
              );
            })}
          </div>
        )}
      </section>

    </div>
  );
}
