import { getLocale, getTranslations } from "next-intl/server";
import SetupScreen from "@/components/album3d/studio/SetupScreen";
import { prisma } from "@/lib/db";
import { getSiteSettings, resolveCreditTerm } from "@/lib/settings";
import { requireSetupUser } from "@/lib/studio3d";

// Reads the session cookie and live settings.
export const dynamic = "force-dynamic";

export default async function StudioSetupPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const locale = await getLocale();
  const user = await requireSetupUser(username, locale);
  const [settings, redeemed, tc] = await Promise.all([
    getSiteSettings(user.id),
    // As on the classic setup: invited accounts chose their login when they registered.
    prisma.invite.findUnique({ where: { redeemedById: user.id }, select: { id: true } }),
    getTranslations("common")
  ]);
  return (
    <SetupScreen
      setup={{
        username: user.username,
        needsCredentials: redeemed === null,
        siteTitleEn: settings.siteTitleEn,
        siteTitleZh: settings.siteTitleZh,
        homeTitleEn: settings.homeTitleEn,
        homeTitleZh: settings.homeTitleZh,
        homeSubtitleEn: settings.homeSubtitleEn,
        homeSubtitleZh: settings.homeSubtitleZh,
        bookingEnabled: settings.bookingEnabled,
        lotteryEnabled: settings.lotteryEnabled,
        creditProfilesEnabled: settings.creditProfilesEnabled,
        creditTerm: resolveCreditTerm(settings, locale, tc("creditTerm"))
      }}
    />
  );
}
