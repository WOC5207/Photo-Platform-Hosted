import { getLocale, getTranslations } from "next-intl/server";
import ConfirmSubmit from "@/components/admin/ConfirmSubmit";
import { buttonClasses } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import PageHeader from "@/components/ui/PageHeader";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createEquipmentCategory, deleteEquipmentCategory } from "../actions";

export default async function ManageEquipmentCategoriesPage() {
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
        title={t("manageCategories")}
        description={t("manageCategoriesHint")}
        action={
          <>
            <Link href="/dashboard/equipment" className={buttonClasses()}>
              {t("backToInventory")}
            </Link>
            <Link
              href="/dashboard/equipment/new"
              className={buttonClasses({ variant: "primary" })}
            >
              {t("addEquipment")}
            </Link>
          </>
        }
      />

      <section className="ui-panel max-w-3xl p-5 sm:p-6">
        <h2 className="font-display text-xl font-semibold">{t("categorySetup")}</h2>
        <p className="mt-1 text-sm text-fg-subtle">{t("categorySetupHint")}</p>

        <form action={createEquipmentCategory} className="mt-5 flex gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
            <span className="font-semibold text-fg-muted">{t("categoryName")}</span>
            <Input name="name" required maxLength={100} />
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
          <p className="mt-5 rounded-xl border border-dashed border-line bg-surface-muted/40 p-4 text-sm text-fg-subtle">
            {t("createCategoryFirst")}
          </p>
        ) : (
          <ul className="mt-5 divide-y divide-line border-y border-line">
            {categories.map((category) => (
              <li key={category.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{category.name}</p>
                  <p className="text-sm text-fg-subtle">
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
    </div>
  );
}
