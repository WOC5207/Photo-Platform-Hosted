import { getLocale, getTranslations } from "next-intl/server";
import ConfirmSubmit from "@/components/admin/ConfirmSubmit";
import EquipmentQrCode from "@/components/equipment/EquipmentQrCode";
import { buttonClasses } from "@/components/ui/Button";
import PageHeader from "@/components/ui/PageHeader";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deleteEquipment, rotateEquipmentQr } from "./actions";

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
  const allEquipment = await prisma.equipmentItem.findMany({ where: { ownerId: user.id }, include: { category: true }, orderBy: [{ category: { name: "asc" } }, { name: "asc" }] });
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

    </div>
  );
}
