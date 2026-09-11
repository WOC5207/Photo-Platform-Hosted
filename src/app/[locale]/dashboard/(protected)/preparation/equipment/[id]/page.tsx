import { notFound } from "next/navigation";
import EquipmentScanner from "@/components/equipment/EquipmentScanner";
import { getLocale, getTranslations } from "next-intl/server";
import ConfirmSubmit from "@/components/admin/ConfirmSubmit";
import EventWorkspaceHeader from "@/components/events/EventWorkspaceHeader";
import { buttonClasses } from "@/components/ui/Button";
import { controlClasses } from "@/components/ui/Field";
import SectionHeading from "@/components/ui/SectionHeading";
import DisclosureSection from "@/components/ui/DisclosureSection";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth";
import { pickText } from "@/lib/content";
import { prisma } from "@/lib/db";
import { equipmentName } from "@/lib/equipment";
import ChecklistEquipmentStatus from "../../ChecklistEquipmentStatus";
import EquipmentPicker from "../../EquipmentPicker";
import PreparationHeader from "../../PreparationHeader";
import {
  addCustomChecklistItem,
  deleteChecklist,
  removeChecklistItem
} from "../../actions";

const STATUS_KEY = {
  IN_INVENTORY: "statusInInventory",
  SIGNED_OUT: "quickStatusSignedOut",
  MAINTENANCE: "statusMaintenance",
  BROKEN: "statusBroken",
  OTHER: "statusOther"
} as const;

const STATUS_CARD_CLASS = {
  PLANNED: "border-border bg-control",
  AT_EVENT: "border-warning-border bg-warning-surface",
  RETURNED: "border-success-border bg-success-surface",
  BROKEN: "border-danger-border bg-danger-surface",
} as const;

const EVENT_STATE_KEY = {
  PLANNED: "eventStatePlanned",
  AT_EVENT: "eventStateAtEvent",
  RETURNED: "eventStateReturned",
  BROKEN: "eventStateBroken"
} as const;

function formatShootDate(value: Date | null, locale: string): string {
  if (!value) return "";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(value);
}

export default async function EquipmentChecklistPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, locale, t, tp] = await Promise.all([
    params,
    getLocale(),
    getTranslations("equipment"),
    getTranslations("preparation")
  ]);
  const user = await requireUser(locale);
  const [checklist, allEquipment] = await Promise.all([
    prisma.equipmentChecklist.findFirst({
      where: { id, ownerId: user.id },
      include: {
        bookingDay: {
          include: {
            bookingEvent: {
              include: { galleryEvent: { where: { ownerId: user.id } } }
            }
          }
        },
        items: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          include: { equipment: { include: { category: true } } }
        }
      }
    }),
    prisma.equipmentItem.findMany({
      where: { ownerId: user.id },
      orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
      include: { category: true }
    })
  ]);
  if (!checklist) notFound();
  const event = checklist.bookingDay?.bookingEvent;
  if (event && event.ownerId !== user.id) notFound();

  const total = checklist.items.length;
  const equipmentItems = checklist.items.filter((item) => item.equipmentId !== null);
  const initialProgress = {
    total: equipmentItems.length,
    planned: equipmentItems.filter((item) => item.eventState === "PLANNED").length,
    atEvent: equipmentItems.filter((item) => item.eventState === "AT_EVENT").length,
    returned: equipmentItems.filter((item) => item.eventState === "RETURNED").length,
    broken: equipmentItems.filter((item) => item.eventState === "BROKEN").length
  };
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

      <section className="ui-panel p-4 sm:p-5">
        <EquipmentScanner checklistId={checklist.id} initialProgress={initialProgress} />
      </section>

      <section className="ui-panel flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="font-meta text-[0.6875rem] font-semibold tracking-[0.14em] text-accent">
              {t("packingChecklistMarker")}
            </span>
            <h2 className="mt-2 break-words font-display text-2xl font-semibold sm:text-3xl">
              {checklist.name}
            </h2>
            <p className="mt-1 text-sm text-fg-subtle">
              {checklist.shootDate
                ? formatShootDate(checklist.shootDate, locale)
                : t("noShootDate")}
            </p>
          </div>
          <span className="rounded-full bg-control px-3 py-1.5 text-sm font-semibold tabular-nums text-fg-muted">
            {t("itemCount", { count: total })}
          </span>
        </div>
        {checklist.notes && (
          <p className="max-w-3xl whitespace-pre-wrap text-sm text-fg-muted">{checklist.notes}</p>
        )}
        {initialProgress.total > 0 && (
          <dl className="grid grid-cols-2 border-t border-border pt-4 sm:grid-cols-4">
            {([
              ["eventStatePlanned", initialProgress.planned],
              ["eventStateAtEvent", initialProgress.atEvent],
              ["eventStateReturned", initialProgress.returned],
              ["eventStateBroken", initialProgress.broken]
            ] as const).map(([label, count], index) => (
              <div key={label} className={`px-3 py-2 first:pl-0 ${index % 2 === 1 ? "border-l border-border" : ""} ${index > 0 ? "sm:border-l sm:border-border" : ""}`}>
                <dt className="text-xs text-fg-subtle">{t(label)}</dt>
                <dd className="mt-1 font-meta text-xl font-semibold tabular-nums">{count}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="ui-panel flex min-w-0 flex-col gap-5 p-5 sm:p-6">
          <SectionHeading title={t("packingList")} description={t("packingListHint")} />
          {total === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-fg-subtle">
              {t("emptyChecklistItems")}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {checklist.items.map((item) => {
                const displayName = item.equipment ? equipmentName(item.equipment) : item.label;
                const statusClass = item.equipment
                  ? STATUS_CARD_CLASS[item.eventState]
                  : "border-border bg-control";
                return (
                  <li
                    key={item.id}
                    data-equipment-status={item.equipment?.status}
                    data-equipment-event-state={item.equipment ? item.eventState : undefined}
                    className={`rounded-xl border p-3 transition-[background-color,border-color] ${statusClass}`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex min-h-11 min-w-0 flex-1 items-center">
                        <span className="min-w-0 flex-1 text-fg">
                          <span className="block break-words font-semibold">{displayName}</span>
                          {item.equipment && (
                            <span className="mt-0.5 block text-xs font-normal text-fg-subtle">
                              {item.equipment.category.name}
                            </span>
                          )}
                        </span>
                      </div>
                      <form action={removeChecklistItem}>
                        <input type="hidden" name="id" value={item.id} />
                        <button
                          type="submit"
                          aria-label={t("removeItem", { name: displayName })}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-fg-subtle hover:bg-danger-surface hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
                        >
                          ×
                        </button>
                      </form>
                    </div>

                    {item.equipment && (
                      <div className="mt-3 border-t border-border pt-3">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-fg-subtle">
                          <span>
                            <strong className="font-semibold text-fg-muted">{t("eventStatus")}: {t(EVENT_STATE_KEY[item.eventState])}</strong>
                            <span className="ml-2">· {t("inventoryStatus")}: {t(STATUS_KEY[item.equipment.status])}</span>
                          </span>
                          <Link href={`/dashboard/equipment/${item.equipment.id}`} className="inline-flex min-h-11 items-center font-semibold text-accent hover:underline">
                            {t("openInventoryItem")}
                          </Link>
                        </div>
                        <ChecklistEquipmentStatus
                          checklistId={checklist.id}
                          equipmentId={item.equipment.id}
                          state={item.eventState}
                          label={displayName}
                          labels={{
                            group: t("setInventoryStatus"),
                            atEvent: t("eventStateAtEvent"),
                            returned: t("eventStateReturned"),
                            broken: t("quickStatusBroken")
                          }}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

        </section>

        <aside className="lg:sticky lg:top-6">
          <DisclosureSection
            title={t("addItems")}
            description={t("addItemsHint")}
            desktopOpen
          >
          <div className="flex flex-col gap-5">
          <EquipmentPicker
            checklistId={checklist.id}
            equipment={allEquipment.map((item) => ({
              id: item.id,
              name: equipmentName(item),
              categoryId: item.categoryId,
              category: item.category.name,
              status: item.status
            }))}
            selectedIds={checklist.items.flatMap((item) => item.equipmentId ? [item.equipmentId] : [])}
          />

          <form action={addCustomChecklistItem} className="flex flex-col gap-3 border-t border-border pt-5">
            <input type="hidden" name="checklistId" value={checklist.id} />
            <label className="flex flex-col gap-2 text-sm" htmlFor={`custom-${checklist.id}`}>
              <span className="font-semibold text-fg-muted">{t("customItem")}</span>
              <input
                id={`custom-${checklist.id}`}
                name="label"
                required
                maxLength={200}
                placeholder={t("customItem")}
                className={controlClasses}
              />
            </label>
            <button type="submit" className={buttonClasses({ size: "compact" })}>
              {t("add")}
            </button>
          </form>

          <form action={deleteChecklist} className="border-t border-border pt-5">
            <input type="hidden" name="id" value={checklist.id} />
            <ConfirmSubmit
              label={t("deleteChecklist")}
              confirmText={t("deleteChecklistConfirm", { name: checklist.name })}
            />
          </form>
          </div>
          </DisclosureSection>
        </aside>
      </div>
    </div>
  );
}
