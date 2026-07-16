import { notFound } from "next/navigation";
import SiteChrome from "@/components/SiteChrome";
import { prisma } from "@/lib/db";

// Resolves the owner from the request token — never prerender.
export const dynamic = "force-dynamic";

/**
 * A booking link's chrome. The token identifies the event and, through it, the
 * owner — which is why these routes carry no /u/<username> and why the links
 * photographers have already shared keep working.
 *
 * Resolving the owner here is what makes a visitor following Bob's booking link
 * see Bob's branding; the shared chrome previously fell back to whichever admin
 * came first in the database.
 */
export default async function BookLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[a-z0-9]+$/.test(token)) notFound();

  const event = await prisma.bookingEvent.findUnique({
    where: { token },
    select: { owner: true }
  });
  if (!event || event.owner.status !== "active") notFound();

  return <SiteChrome owner={event.owner}>{children}</SiteChrome>;
}
