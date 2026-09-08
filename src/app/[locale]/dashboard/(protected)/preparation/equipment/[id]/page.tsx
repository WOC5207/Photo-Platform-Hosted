import { notFound } from "next/navigation";
import EquipmentScanner from "@/components/equipment/EquipmentScanner";
import { getLocale, getTranslations } from "next-intl/server";
import ConfirmSubmit from "@/components/admin/ConfirmSubmit";
import EventWorkspaceHeader from "@/components/events/EventWorkspaceHeader";
import { buttonClasses } from "@/components/ui/Button";
import { controlClasses } from "@/components/ui/Field";
import SectionHeading from "@/components/ui/SectionHeading";
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
  IN_INVENTORY: "border-success-border bg-success-surface",
  SIGNED_OUT: "border-warning-border bg-warning-surface",
  MAINTENANCE: "border-danger-border bg-danger-surface",
  BROKEN: "border-danger-border bg-danger-surface",
  OTHER: "border-accent/30 bg-accent-surface"
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
  const backHref = event
    ? `/dashboard/preparation/equipment?event=${event.id}`
    : "/dashboard/preparation/equipment";

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

      <Link href={backHref} className={buttonClasses({ variant: "ghost", className: "self-start" })}>
        {t("backToChecklists")}
      </Link>

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
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="ui-panel flex min-w-0 flex-col gap-5 p-5 sm:p-6">
          <SectionHeading title={t("packingList")} description={t("packingListHint")} />
          <EquipmentScanner checklistId={checklist.id} />
          {total === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-fg-subtle">
              {t("emptyChecklistItems")}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {checklist.items.map((item) => {
                const displayName = item.equipment ? equipmentName(item.equipment) : item.label;
                const statusClass = item.equipment
                  ? STATUS_CARD_CLASS[item.equipment.status]
                  : "border-border bg-control";
                return (
                  <li
                    key={item.id}
                    data-equipment-status={item.equipment?.status}
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
                          <span>{t("inventoryStatus")}: {t(STATUS_KEY[item.equipment.status])}</span>
                          <Link href={`/dashboard/equipment/${item.equipment.id}`} className="font-semibold text-accent hover:underline">
                            {t("openInventoryItem")}
                          </Link>
                        </div>
                        <ChecklistEquipmentStatus
                          checklistId={checklist.id}
                          equipmentId={item.equipment.id}
                          status={item.equipment.status}
                          label={displayName}
                          labels={{
                            group: t("setInventoryStatus"),
                            signedOut: t("quickStatusSignedOut"),
                            inInventory: t("quickStatusInInventory"),
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

        <aside className="ui-panel flex flex-col gap-5 p-5 sm:p-6 lg:sticky lg:top-6">
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
        </aside>
      </div>
    </div>
  );
}
