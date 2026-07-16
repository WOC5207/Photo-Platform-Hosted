import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  getSiteSettings,
  getContactMethods,
  getPersonalLinks,
  resolveCreditTerm
} from "@/lib/settings";
import { siteImageUrl } from "@/lib/images";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import SetupWizard from "@/components/admin/SetupWizard";
import { logout } from "../../login/actions";

// Reads the session cookie and live settings — never prerender.
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const locale = await getLocale();
  // requireUser, not requireAdmin: this is every account's first-run wizard.
  // Guarding it on role locked invited users out of their own setup — and
  // therefore out of their dashboard, permanently.
  const user = await requireUser(locale);

  const settings = await getSiteSettings(user.id);
  if (settings.setupCompleted) redirect(`/${locale}/dashboard`);

  // Only the account seeded from ADMIN_USERNAME/ADMIN_PASSWORD needs to be
  // moved off those placeholders. Anyone who redeemed an invite already chose
  // their own credentials, so keyed on the invite rather than on role — a
  // second admin promoted later would not need the step either.
  const redeemed = await prisma.invite.findUnique({
    where: { redeemedById: user.id },
    select: { id: true }
  });
  const needsCredentials = redeemed === null;

  const t = await getTranslations("setup");
  const tc = await getTranslations("common");
  const [contactMethods, personalLinks] = await Promise.all([
    getContactMethods(user.id),
    getPersonalLinks(user.id)
  ]);
  const creditTerm = resolveCreditTerm(settings, locale, tc("creditTerm"));

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center gap-6 px-4 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("welcomeTitle")}</h1>
          <p className="mt-1 text-sm text-fg-subtle">{t("welcomeHint")}</p>
        </div>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <form action={logout}>
            <button
              type="submit"
              className="text-xs text-fg-subtle underline hover:text-fg"
            >
              {t("logOutInstead")}
            </button>
          </form>
        </div>
      </div>

      <SetupWizard
        needsCredentials={needsCredentials}
        initialUsername={user.username}
        settings={{
          siteTitleEn: settings.siteTitleEn,
          siteTitleZh: settings.siteTitleZh,
          homeTitleEn: settings.homeTitleEn,
          homeTitleZh: settings.homeTitleZh,
          homeSubtitleEn: settings.homeSubtitleEn,
          homeSubtitleZh: settings.homeSubtitleZh,
          bookingEnabled: settings.bookingEnabled,
          lotteryEnabled: settings.lotteryEnabled,
          creditProfilesEnabled: settings.creditProfilesEnabled
        }}
        creditTerm={creditTerm}
        contactMethods={contactMethods.map((m) => ({
          id: m.id,
          labelEn: m.labelEn,
          labelZh: m.labelZh
        }))}
        personalLinks={personalLinks.map((l) => ({
          id: l.id,
          labelEn: l.labelEn,
          labelZh: l.labelZh,
          url: l.url
        }))}
        logoUrl={siteImageUrl(settings.logo)}
        backgroundUrl={siteImageUrl(settings.backgroundImage)}
      />
    </div>
  );
}
