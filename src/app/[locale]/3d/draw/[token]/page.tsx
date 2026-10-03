import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { prisma } from "@/lib/db";
import { screenPath } from "@/lib/siteMode";

export const dynamic = "force-dynamic";

/** A prize-draw link carries only its token; see /3d/book/[token]. */
export default async function DrawTokenRedirect({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const locale = await getLocale();
  const draw = /^[a-z0-9]+$/.test(token)
    ? await prisma.lotteryDraw.findUnique({
        where: { token },
        select: { bookingEvent: { select: { owner: { select: { username: true } } } } }
      })
    : null;
  redirect(
    `/${locale}${draw ? screenPath({ kind: "draw", username: draw.bookingEvent.owner.username, token }) : screenPath({ kind: "title" })}`
  );
}
