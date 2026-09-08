import { getLocale, getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Link } from "@/i18n/navigation";
import PageHeader from "@/components/ui/PageHeader";
import { buttonClasses } from "@/components/ui/Button";
import EquipmentContactForm from "@/components/equipment/EquipmentContactForm";

export default async function EquipmentContactPage() {
  const user = await requireUser(await getLocale());
  const t = await getTranslations("equipmentScan");
  const initial = await prisma.siteSettings.findUnique({ where: { ownerId: user.id }, select: { equipmentContactMethod: true, equipmentContactLabel: true, equipmentContactValue: true } });
  return <div className="flex flex-col gap-8">
    <PageHeader title={t("contactTitle")} action={<Link href="/dashboard/equipment" className={buttonClasses()}>{t("backInventory")}</Link>} />
    <EquipmentContactForm initial={initial ?? { equipmentContactMethod: "", equipmentContactLabel: "", equipmentContactValue: "" }} />
  </div>;
}
