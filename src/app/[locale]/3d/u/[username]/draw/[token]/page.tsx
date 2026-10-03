import { getLocale } from "next-intl/server";
import DrawScreen from "@/components/album3d/booking/DrawScreen";
import { loadPrizeDraw } from "@/lib/booking3d";

export const dynamic = "force-dynamic";

export default async function PrizeDrawPage({ params }: { params: Promise<{ username: string; token: string }> }) {
  const { username, token } = await params;
  return <DrawScreen draw={await loadPrizeDraw(username, token, await getLocale())} />;
}
