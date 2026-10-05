import { notFound, redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import LotteryScreen from "@/components/album3d/studio/LotteryScreen";
import { screenPath } from "@/lib/siteMode";
import { loadStudioLottery, requireStudioUser } from "@/lib/studio3d";

export const dynamic = "force-dynamic";

export default async function StudioLotteryPage({ params }: { params: Promise<{ username: string; id: string }> }) {
  const { username, id } = await params;
  const locale = await getLocale();
  const user = await requireStudioUser(username, locale);
  const lottery = await loadStudioLottery(user, id, locale);
  if (!lottery) notFound();
  // A draw that was never switched on opens the booking page, as on the classic site.
  if (lottery === "off") redirect(`/${locale}${screenPath({ kind: "studio", username: user.username, page: "booking", id })}`);
  return <LotteryScreen lottery={lottery} />;
}
