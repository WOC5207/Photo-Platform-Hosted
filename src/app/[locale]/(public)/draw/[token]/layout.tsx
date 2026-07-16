import { notFound } from "next/navigation";
import SiteChrome from "@/components/SiteChrome";
import { prisma } from "@/lib/db";

// Resolves the owner from the request token — never prerender.
export const dynamic = "force-dynamic";

/** A prize-draw link's chrome; see the booking layout for why this exists. */
export default async function DrawLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[a-z0-9]+$/.test(token)) notFound();

  const draw = await prisma.lotteryDraw.findUnique({
    where: { token },
    select: { bookingEvent: { select: { owner: true } } }
  });
  if (!draw || draw.bookingEvent.owner.status !== "active") notFound();

  return <SiteChrome owner={draw.bookingEvent.owner}>{children}</SiteChrome>;
}
