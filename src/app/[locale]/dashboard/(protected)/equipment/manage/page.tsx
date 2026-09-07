import { getLocale, getTranslations } from "next-intl/server";
import ConfirmSubmit from "@/components/admin/ConfirmSubmit";
import { buttonClasses } from "@/components/ui/Button";
import PageHeader from "@/components/ui/PageHeader";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  createEquipment,
  createEquipmentCategory,
  deleteEquipmentCategory
} from "../actions";

const inputClasses =
  "min-h-11 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg outline-none transition focus-visible:border-fg-subtle focus-visible:ring-2 focus-visible:ring-fg/20";

export default async function ManageEquipmentPage() {
  const [locale, t] = await Promise.all([
    getLocale(),
    getTranslations("equipment")
  ]);
  const user = await requireUser(locale);
  const categories = await prisma.equipmentCategory.findMany({
    where: { ownerId: user.id },
    orderBy: { name: "asc" },
    include: { _count: { select: { items: true } } }
  });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={t("inventorySetupTitle")}
        description={t("inventorySetupDescription")}
        action={(
          <Link href="/dashboard/equipment" className={buttonClasses()}>
            ← {t("backToInventory")}
          </Link>
        )}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="ui-panel p-5 sm:p-6">
          <h2 className="font-display text-xl font-semibold">{t("manageCategories")}</h2>
          <p className="mt-1 text-sm text-fg-subtle">{t("manageCategoriesHint")}</p>
          <form action={createEquipmentCategory} className="mt-5 flex gap-2">
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
              <span className="text-fg-muted">{t("categoryName")}</span>
              <input name="name" required maxLength={100} className={inputClasses} />
            </label>
            <button
              type="submit"
              className={buttonClasses({
                variant: "primary",
                size: "compact",
                className: "self-end"
              })}
            >
              {t("createCategory")}
            </button>
          </form>
          {categories.length === 0 ? (
            <p className="mt-4 rounded-lg border border-dashed border-border p-4 text-sm text-fg-subtle">
              {t("createCategoryFirst")}
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-2">
              {categories.map((category) => (
                <li
                  key={category.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-control px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-fg">{category.name}</p>
                    <p className="text-xs text-fg-subtle">
                      {t("categoryCount", { count: category._count.items })}
                    </p>
                  </div>
                  {category._count.items === 0 && (
                    <form action={deleteEquipmentCategory}>
                      <input type="hidden" name="id" value={category.id} />
                      <ConfirmSubmit
                        label={t("deleteCategory")}
                        confirmText={t("deleteCategoryConfirm", { name: category.name })}
                      />
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="ui-panel p-5 sm:p-6">
          <h2 className="font-display text-xl font-semibold">{t("addEquipment")}</h2>
          <p className="mt-1 text-sm text-fg-subtle">{t("addEquipmentHint")}</p>
          <form action={createEquipment} className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-fg-muted">{t("equipmentName")}</span>
              <input name="name" required maxLength={160} className={inputClasses} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-fg-muted">{t("category")}</span>
              <select
                name="categoryId"
                required
                disabled={categories.length === 0}
                defaultValue=""
                className={inputClasses}
              >
                <option value="" disabled>{t("chooseCategory")}</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span className="text-fg-muted">{t("serialNumber")}</span>
              <input name="serialNumber" maxLength={160} className={inputClasses} />
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span className="text-fg-muted">{t("notes")}</span>
              <textarea name="notes" rows={3} maxLength={2000} className={inputClasses} />
            </label>
            <button
              type="submit"
              disabled={categories.length === 0}
              className={buttonClasses({
                variant: "primary",
                className: "sm:col-span-2 sm:justify-self-start"
              })}
            >
              {t("addEquipmentButton")}
            </button>
            {categories.length === 0 && (
              <p className="text-sm text-fg-subtle sm:col-span-2">{t("createCategoryFirst")}</p>
            )}
          </form>
        </section>
      </div>
    </div>
  );
}
