import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { prisma } from "@/lib/db";
import { screenPath } from "@/lib/siteMode";

export const dynamic = "force-dynamic";

/**
 * A booking link carries only its token. The site switch sends /book/<token>
 * here, which forwards to the 3D address naming the photographer.
 */
export default async function BookingTokenRedirect({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const locale = await getLocale();
  const event = /^[a-z0-9]+$/.test(token)
    ? await prisma.bookingEvent.findUnique({ where: { token }, select: { owner: { select: { username: true } } } })
    : null;
  redirect(`/${locale}${event ? screenPath({ kind: "book", username: event.owner.username, token }) : screenPath({ kind: "title" })}`);
}
