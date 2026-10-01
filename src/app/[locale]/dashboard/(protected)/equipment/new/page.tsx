import { getLocale, getTranslations } from "next-intl/server";
import EquipmentCreateForm from "@/components/equipment/EquipmentCreateForm";
import { buttonClasses } from "@/components/ui/Button";
import PageHeader from "@/components/ui/PageHeader";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function NewEquipmentPage({ searchParams }: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const [locale, t, tQr, params] = await Promise.all([
    getLocale(),
    getTranslations("equipment"),
    getTranslations("equipmentQrPrint"),
    searchParams
  ]);
  const returnToQrLabels = params.returnTo === "qr-labels";
  const user = await requireUser(locale);
  const categories = await prisma.equipmentCategory.findMany({
    where: { ownerId: user.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true }
  });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={t("newEquipmentTitle")}
        description={t("addEquipmentHint")}
        action={
          returnToQrLabels ? (
            <Link href="/dashboard/equipment/qr-labels" className={buttonClasses()}>
              {tQr("backToQrLabels")}
            </Link>
          ) : (
            <Link href="/dashboard/equipment" className={buttonClasses()}>
              {t("backToInventory")}
            </Link>
          )
        }
      />

      <section className="ui-panel max-w-3xl p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-semibold">{t("equipmentDetails")}</h2>
            <p className="mt-1 text-sm text-fg-subtle">{t("equipmentDetailsHint")}</p>
          </div>
          <Link
            href="/dashboard/equipment/manage"
            className={buttonClasses({ variant: "ghost", size: "compact" })}
          >
            {t("manageCategories")}
          </Link>
        </div>
        <EquipmentCreateForm categories={categories} returnToQrLabels={returnToQrLabels} />
      </section>
    </div>
  );
}
