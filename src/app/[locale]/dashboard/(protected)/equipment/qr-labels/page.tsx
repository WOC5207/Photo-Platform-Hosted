import { getLocale, getTranslations } from "next-intl/server";
import EquipmentQrSheetBuilder from "@/components/equipment/EquipmentQrSheetBuilder";
import { buttonClasses } from "@/components/ui/Button";
import PageHeader from "@/components/ui/PageHeader";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { equipmentName } from "@/lib/equipment";
import { siteImageUrl } from "@/lib/images";
import { getSiteSettings } from "@/lib/settings";

export default async function EquipmentQrLabelsPage({ searchParams }: {
  searchParams: Promise<{ selected?: string | string[] }>;
}) {
  const [locale, t, params] = await Promise.all([
    getLocale(),
    getTranslations("equipmentQrPrint"),
    searchParams
  ]);
  const user = await requireUser(locale);
  const [items, settings] = await Promise.all([
    prisma.equipmentItem.findMany({
      where: { ownerId: user.id },
      orderBy: [
        { sortOrder: "asc" },
        { category: { name: "asc" } },
        { brand: "asc" },
        { model: "asc" }
      ],
      select: {
        id: true,
        name: true,
        brand: true,
        model: true,
        qrToken: true,
        category: { select: { name: true } }
      }
    }),
    getSiteSettings(user.id)
  ]);
  const equipment = items.map((item) => ({
    id: item.id,
    name: equipmentName(item),
    category: item.category.name,
    qrToken: item.qrToken
  }));
  const categories = Array.from(new Set(equipment.map((item) => item.category)));
  const requestedIds = new Set([params.selected ?? []].flat());
  const initialSelectedIds = equipment
    .filter((item) => requestedIds.has(item.id))
    .map((item) => item.id);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        index="QR"
        title={t("title")}
        description={t("description")}
        action={
          <Link href="/dashboard/equipment" className={buttonClasses()}>
            {t("backToInventory")}
          </Link>
        }
      />
      <EquipmentQrSheetBuilder
        equipment={equipment}
        categories={categories}
        locale={locale}
        logoUrl={siteImageUrl(settings.logo)}
        initialSelectedIds={initialSelectedIds}
      />
    </div>
  );
}
