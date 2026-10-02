import { getTranslations } from "next-intl/server";
import PlatformThemeForm from "@/components/admin/PlatformThemeForm";
import PageHeader from "@/components/ui/PageHeader";
import {
  getPlatformSettings,
  platformPublicPalettes
} from "@/lib/platformSettings";

// Auth depends on the request cookie — never prerender. The layout's
// requireAdmin is the authorisation.
export const dynamic = "force-dynamic";

export default async function PublicThemePage() {
  const [t, settings] = await Promise.all([
    getTranslations("adminTheme"),
    getPlatformSettings()
  ]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t("pageTitle")} description={t("intro")} />
      <PlatformThemeForm initial={platformPublicPalettes(settings)} />
    </div>
  );
}
