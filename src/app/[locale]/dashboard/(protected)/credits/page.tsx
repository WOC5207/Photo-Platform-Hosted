import { redirect } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { getCreditProfiles, getSiteSettings, resolveCreditTerm } from "@/lib/settings";
import CreditProfilesManager, {
  type AdminCreditProfile
} from "@/components/admin/CreditProfilesManager";

export default async function CreditProfilesPage() {
  const t = await getTranslations("adminCredits");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  const user = await requireUser(locale);
  const settings = await getSiteSettings(user.id);
  if (!settings.creditProfilesEnabled) redirect(`/${locale}/dashboard`);
  const creditTerm = resolveCreditTerm(settings, locale, tc("creditTerm"));
  const roster = await getCreditProfiles(user.id);

  const creditProfiles: AdminCreditProfile[] = roster.map((c) => ({
    id: c.id,
    creditName: c.creditName,
    socialLinks: c.socialLinks.map((s) => ({ platform: s.platform, url: s.url }))
  }));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">{t("title", { term: creditTerm })}</h1>
        <p className="mt-1 text-fg-subtle">{t("intro")}</p>
      </div>
      <CreditProfilesManager creditProfiles={creditProfiles} creditTerm={creditTerm} />
    </div>
  );
}
