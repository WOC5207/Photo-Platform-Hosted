import { getLocale, getTranslations } from "next-intl/server";
import ConfirmSubmit from "@/components/admin/ConfirmSubmit";
import EquipmentQrCode from "@/components/equipment/EquipmentQrCode";
import EquipmentSortableGrid from "@/components/equipment/EquipmentSortableGrid";
import { buttonClasses } from "@/components/ui/Button";
import PageHeader from "@/components/ui/PageHeader";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { equipmentName, equipmentPhotoUrl } from "@/lib/equipment";
import { deleteEquipment, rotateEquipmentQr } from "./actions";

const STATUS_KEY = {
  IN_INVENTORY: "statusInInventory",
  SIGNED_OUT: "statusSignedOut",
  MAINTENANCE: "statusMaintenance",
  BROKEN: "statusBroken",
  OTHER: "statusOther"
} as const;

const STATUS_CLASS = {
  IN_INVENTORY: "border-success-border bg-success-surface text-success-strong",
  SIGNED_OUT: "border-accent/25 bg-accent-surface text-accent",
  MAINTENANCE: "border-danger-border bg-danger-surface text-danger-strong",
  BROKEN: "border-danger-border bg-danger-surface text-danger-strong",
  OTHER: "border-border-strong bg-control text-fg-muted"
} as const;

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
  const ts = await getTranslations("equipmentScan");
  const categories = await prisma.equipmentCategory.findMany({
    where: { ownerId: user.id },
    orderBy: { name: "asc" },
    include: { _count: { select: { items: true } } }
  });
  const selectedCategory = categories.find(
    (category) => category.id === requestedCategory
  );
  const allEquipment = await prisma.equipmentItem.findMany({
    where: { ownerId: user.id },
    include: { category: true },
    orderBy: [
      { sortOrder: "asc" },
      { category: { name: "asc" } },
      { name: "asc" },
      { createdAt: "asc" }
    ]
  });
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
      />

      <nav
        aria-label={t("equipmentActions")}
        className="grid min-w-0 gap-2 sm:grid-cols-2 2xl:grid-cols-4"
      >
        <Link
          href="/dashboard/equipment/qr-labels"
          className={buttonClasses({ className: "min-w-0 whitespace-normal text-center" })}
        >
          {t("printQrLabels")}
        </Link>
        <Link
          href="/dashboard/equipment/contact"
          className={buttonClasses({ className: "min-w-0 whitespace-normal text-center" })}
        >
          {ts("contactTitle")}
        </Link>
        <Link
          href="/dashboard/equipment/manage"
          className={buttonClasses({ className: "min-w-0 whitespace-normal text-center" })}
        >
          {t("manageCategories")}
        </Link>
        <Link
          href="/dashboard/equipment/new"
          className={buttonClasses({
            variant: "primary",
            className: "min-w-0 whitespace-normal text-center"
          })}
        >
          {t("addEquipment")}
        </Link>
      </nav>

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
            ? t("scanFound", { name: equipmentName(scanned) })
            : t("scanNotFound")}
        </div>
      )}

      <nav aria-label={t("browseCategories")} className="flex min-w-0 flex-col gap-3">
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

      <section className="flex min-w-0 flex-col gap-4">
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-semibold">{t("inventoryTitle")}</h2>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-fg-subtle">{t("inventoryHint")}</p>
        </div>
        {equipment.length === 0 ? (
          <p className="ui-panel flex min-h-32 items-center justify-center p-6 text-center text-sm text-fg-subtle">
            {selectedCategory ? t("emptyCategory", { name: selectedCategory.name }) : t("emptyInventory")}
          </p>
        ) : (
          <EquipmentSortableGrid
            itemIds={equipment.map((item) => item.id)}
            allItemIds={allEquipment.map((item) => item.id)}
            highlightedId={scanned?.id}
            labels={{
              drag: t("reorderDrag"),
              moveEarlier: t("reorderEarlier"),
              moveLater: t("reorderLater"),
              saving: t("reorderSaving"),
              saved: t("reorderSaved"),
              error: t("reorderError")
            }}
          >
            {equipment.map((item) => (
              <article
                key={item.id}
                className="flex min-w-0 flex-col gap-4"
              >
                {item.photoToken && <div className="ui-image-frame aspect-[4/3] overflow-hidden rounded-lg bg-control">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={equipmentPhotoUrl(item.photoToken)} alt={t("photoAlt", { name: equipmentName(item) })} className="h-full w-full object-cover" />
                </div>}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-fg">{equipmentName(item)}</h3>
                    <p className="mt-1 text-xs text-fg-subtle">
                      {item.category.name}{item.brand ? ` · ${item.brand}` : ""}
                    </p>
                  </div>
                  <span className="rounded-md bg-accent-surface px-2 py-1 font-mono text-[0.625rem] font-semibold text-accent">
                    {item.qrToken.slice(0, 8).toUpperCase()}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_CLASS[item.status]}`}>{t(STATUS_KEY[item.status])}</span>
                  {item.statusNote && <span className="min-w-0 flex-1 text-sm text-fg-muted">{item.statusNote}</span>}
                </div>
                {item.serialNumber && (
                  <p className="text-sm text-fg-muted">
                    <span className="text-fg-subtle">{t("serialShort")}: </span>
                    {item.serialNumber}
                  </p>
                )}
                {item.notes && <p className="whitespace-pre-wrap text-sm text-fg-muted">{item.notes}</p>}
                <details open={scanned?.id === item.id} className="group min-w-0 border-t border-border pt-3">
                  <summary className="inline-flex min-h-10 cursor-pointer list-none items-center rounded-sm text-sm font-semibold text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface">
                    {t("showQr")}
                  </summary>
                  <div className="mt-3 min-w-0">
                    <EquipmentQrCode name={equipmentName(item)} qrToken={item.qrToken} locale={locale} />
                  </div>
                </details>
                <div className="mt-auto flex flex-wrap gap-2 border-t border-border pt-3">
                  <Link
                    href={`/dashboard/equipment/${item.id}`}
                    className={buttonClasses({ size: "compact" })}
                  >
                    {t("editEquipment")}
                  </Link>
                  <form action={rotateEquipmentQr}>
                    <input type="hidden" name="id" value={item.id} />
                    <ConfirmSubmit
                      label={t("replaceQr")}
                      confirmText={t("replaceQrConfirm", { name: equipmentName(item) })}
                    />
                  </form>
                  <form action={deleteEquipment}>
                    <input type="hidden" name="id" value={item.id} />
                    <ConfirmSubmit label={t("deleteEquipment")} confirmText={t("deleteEquipmentConfirm", { name: equipmentName(item) })} />
                  </form>
                </div>
              </article>
            ))}
          </EquipmentSortableGrid>
        )}
      </section>

    </div>
  );
}
