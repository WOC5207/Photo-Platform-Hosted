import { getTranslations } from "next-intl/server";
import PageHeader from "@/components/ui/PageHeader";
import Tabs from "@/components/ui/Tabs";
import { Link } from "@/i18n/navigation";

export default async function PreparationHeader({ active }: { active: "slots" | "equipment" }) {
  const t = await getTranslations("preparation");
  const tw = await getTranslations("eventWorkspace");
  return <>
    <Link href="/dashboard/events" className="inline-flex min-h-11 self-start items-center text-sm font-semibold text-fg-subtle hover:text-accent">{tw("back")}</Link>
    <PageHeader title={t("title")} description={t("description")} />
    <Tabs active={active} label={t("title")} items={[
      { id: "slots", label: t("slots"), href: "/dashboard/preparation/slots" },
      { id: "equipment", label: t("equipment"), href: "/dashboard/preparation/equipment" }
    ]} />
  </>;
}
