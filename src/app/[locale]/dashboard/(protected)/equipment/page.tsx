import { getLocale, getTranslations } from "next-intl/server";
import ConfirmSubmit from "@/components/admin/ConfirmSubmit";
import EquipmentQrCode from "@/components/equipment/EquipmentQrCode";
import { buttonClasses } from "@/components/ui/Button";
import PageHeader from "@/components/ui/PageHeader";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  addCustomChecklistItem,
  addEquipmentToChecklist,
  createChecklist,
  deleteChecklist,
  deleteEquipment,
  removeChecklistItem,
  resetChecklist,
  rotateEquipmentQr,
  toggleChecklistItem
} from "./actions";

const inputClasses =
  "min-h-11 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg outline-none transition focus-visible:border-fg-subtle focus-visible:ring-2 focus-visible:ring-fg/20";

function formatShootDate(value: Date | null, locale: string): string {
  if (!value) return "";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(value);
}

export default async function EquipmentPage({
  searchParams
}: {
  searchParams: Promise<{ scan?: string; category?: string }>;
}) {
  const [{ scan, category: requestedCategory }, locale, t] = await Promise.all([
    searchParams,
    getLocale(),
    getTranslations("equipment")
  ]);
  const user = await requireUser(locale);
  const categories = await prisma.equipmentCategory.findMany({
    where: { ownerId: user.id },
    orderBy: { name: "asc" },
    include: { _count: { select: { items: true } } }
  });
  const selectedCategory = categories.find(
    (category) => category.id === requestedCategory
  );
  const [allEquipment, checklists] = await Promise.all([
    prisma.equipmentItem.findMany({
      where: { ownerId: user.id },
      orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
      include: { category: true }
    }),
    prisma.equipmentChecklist.findMany({
      where: { ownerId: user.id },
      orderBy: [{ shootDate: "asc" }, { createdAt: "desc" }],
      include: {
        items: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          include: { equipment: true }
        }
      }
    })
  ]);
  const equipment = selectedCategory
    ? allEquipment.filter((item) => item.categoryId === selectedCategory.id)
    : allEquipment;
  const scanned = scan
    ? allEquipment.find((item) => item.qrToken === scan)
    : null;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={t("title")}
        description={t("description")}
        action={(
          <Link
            href="/dashboard/equipment/manage"
            className={buttonClasses({ variant: "primary" })}
          >
            {t("manageInventory")}
          </Link>
        )}
      />

      {scan && (
        <div
          role="status"
          className={`rounded-xl border p-4 text-sm ${
            scanned
              ? "border-success-border bg-success-surface text-success"
              : "border-danger-border bg-danger-surface text-danger"
          }`}
        >
          {scanned
            ? t("scanFound", { name: scanned.name })
            : t("scanNotFound")}
        </div>
      )}

      <nav aria-label={t("browseCategories")} className="flex flex-col gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">{t("browseCategories")}</h2>
          <p className="mt-1 text-sm text-fg-subtle">{t("browseCategoriesHint")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/equipment"
            aria-current={!selectedCategory ? "page" : undefined}
            className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
              !selectedCategory
                ? "border-accent bg-accent text-accent-fg"
                : "border-border-strong bg-surface text-fg-muted hover:border-accent hover:text-accent"
            }`}
          >
            {t("allCategories")}
            <span className="text-xs opacity-75">{allEquipment.length}</span>
          </Link>
          {categories.map((category) => (
            <Link
              key={category.id}
              href={`/dashboard/equipment?category=${category.id}`}
              aria-current={selectedCategory?.id === category.id ? "page" : undefined}
              className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                selectedCategory?.id === category.id
                  ? "border-accent bg-accent text-accent-fg"
                  : "border-border-strong bg-surface text-fg-muted hover:border-accent hover:text-accent"
              }`}
            >
              {category.name}
              <span className="text-xs opacity-75">{category._count.items}</span>
            </Link>
          ))}
        </div>
      </nav>

      <div className="max-w-2xl">
        <section className="ui-panel p-5 sm:p-6">
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

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold">{t("inventoryTitle")}</h2>
          <p className="mt-1 text-sm text-fg-subtle">{t("inventoryHint")}</p>
        </div>
        {equipment.length === 0 ? (
          <p className="ui-panel flex min-h-32 items-center justify-center p-6 text-center text-sm text-fg-subtle">
            {selectedCategory ? t("emptyCategory", { name: selectedCategory.name }) : t("emptyInventory")}
          </p>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {equipment.map((item) => (
              <li
                key={item.id}
                id={`equipment-${item.id}`}
                className={`ui-panel flex flex-col gap-4 p-5 ${
                  scanned?.id === item.id ? "ring-2 ring-success" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-fg">{item.name}</h3>
                    <p className="mt-1 text-xs text-fg-subtle">
                      {item.category.name}
                    </p>
                  </div>
                  <span className="rounded-md bg-accent-surface px-2 py-1 font-mono text-[0.625rem] font-semibold text-accent">
                    {item.qrToken.slice(0, 8).toUpperCase()}
                  </span>
                </div>
                {item.serialNumber && (
                  <p className="text-sm text-fg-muted">
                    <span className="text-fg-subtle">{t("serialShort")}: </span>
                    {item.serialNumber}
                  </p>
                )}
                {item.notes && <p className="whitespace-pre-wrap text-sm text-fg-muted">{item.notes}</p>}
                <details open={scanned?.id === item.id} className="group border-t border-border pt-3">
                  <summary className="cursor-pointer list-none text-sm font-semibold text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
                    {t("showQr")}
                  </summary>
                  <div className="mt-3">
                    <EquipmentQrCode name={item.name} qrToken={item.qrToken} locale={locale} />
                  </div>
                </details>
                <div className="mt-auto flex flex-wrap gap-2 border-t border-border pt-3">
                  <form action={rotateEquipmentQr}>
                    <input type="hidden" name="id" value={item.id} />
                    <ConfirmSubmit
                      label={t("replaceQr")}
                      confirmText={t("replaceQrConfirm", { name: item.name })}
                    />
                  </form>
                  <form action={deleteEquipment}>
                    <input type="hidden" name="id" value={item.id} />
                    <ConfirmSubmit label={t("deleteEquipment")} confirmText={t("deleteEquipmentConfirm", { name: item.name })} />
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

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
                <article key={checklist.id} className="ui-panel flex flex-col gap-5 p-5 sm:p-6">
                  <header className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-display text-xl font-semibold">{checklist.name}</h3>
                      <p className="mt-1 text-xs text-fg-subtle">
                        {checklist.shootDate
                          ? formatShootDate(checklist.shootDate, locale)
                          : t("noShootDate")}
                      </p>
                    </div>
                    <span className="rounded-full bg-control px-3 py-1 text-xs font-semibold text-fg-muted">
                      {t("progress", { completed, total })}
                    </span>
                  </header>
                  <div className="h-2 overflow-hidden rounded-full bg-control" aria-hidden="true">
                    <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${percent}%` }} />
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
                              className="flex w-full items-center gap-3 rounded-md p-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
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
                            <button type="submit" aria-label={t("removeItem", { name: item.label })} className="flex h-9 w-9 items-center justify-center rounded-md text-fg-subtle hover:bg-danger-surface hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40">
                              ×
                            </button>
                          </form>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
                    <form action={addEquipmentToChecklist} className="flex gap-2">
                      <input type="hidden" name="checklistId" value={checklist.id} />
                      <label className="sr-only" htmlFor={`equipment-${checklist.id}`}>{t("chooseEquipment")}</label>
                      <select id={`equipment-${checklist.id}`} name="equipmentId" required disabled={allEquipment.length === 0} className={inputClasses} defaultValue="">
                        <option value="" disabled>{t("chooseEquipment")}</option>
                        {allEquipment.map((item) => (
                          <option key={item.id} value={item.id}>{item.name}</option>
                        ))}
                      </select>
                      <button type="submit" disabled={allEquipment.length === 0} className={buttonClasses({ size: "compact" })}>
                        {t("add")}
                      </button>
                    </form>
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
