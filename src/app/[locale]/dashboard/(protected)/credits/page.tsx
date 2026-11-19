import { getTranslations, getLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth";
import { getCreditProfiles, getSiteSettings, resolveCreditTerm } from "@/lib/settings";
import CreditProfilesManager, {
  type AdminCreditProfile
} from "@/components/admin/CreditProfilesManager";

export default async function CreditProfilesPage() {
  const t = await getTranslations("adminCredits");
  const ta = await getTranslations("album3d");
  const ts = await getTranslations("adminSite");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  const user = await requireUser(locale);
  const settings = await getSiteSettings(user.id);
  const creditTerm = resolveCreditTerm(settings, locale, tc("creditTerm"));
  if (!settings.creditProfilesEnabled) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-[-0.03em]">{t("title", { term: creditTerm })}</h1>
          <p className="mt-1 text-fg-subtle">{t("intro")}</p>
        </div>
        <div role="status" className="flex flex-col items-start gap-3 rounded-xl border border-accent/25 bg-accent-surface p-5">
          <p className="text-sm text-fg-muted">{ts("groupCreditsHint", { term: creditTerm })}</p>
          <Link
            href="/dashboard/settings?section=features"
            className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-accent underline underline-offset-4"
          >
            {ta("studioEnableInFeatures")} <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    );
  }
  const roster = await getCreditProfiles(user.id);

  const creditProfiles: AdminCreditProfile[] = roster.map((c) => ({
    id: c.id,
    creditName: c.creditName,
    socialLinks: c.socialLinks.map((s) => ({ platform: s.platform, url: s.url }))
  }));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-[-0.03em]">{t("title", { term: creditTerm })}</h1>
        <p className="mt-1 text-fg-subtle">{t("intro")}</p>
      </div>
      <CreditProfilesManager creditProfiles={creditProfiles} creditTerm={creditTerm} />
    </div>
  );
}
