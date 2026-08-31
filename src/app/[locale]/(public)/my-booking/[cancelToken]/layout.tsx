import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SiteChrome from "@/components/SiteChrome";
import { prisma } from "@/lib/db";

// Resolves the owner from the request token — never prerender.
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  referrer: "no-referrer",
  robots: {
    index: false,
    follow: false
  }
};

/**
 * A visitor's own booking page. Reached only by holding the unguessable cancel
 * token, which resolves the owner through the slot's event; see the booking
 * layout for why the chrome is resolved rather than assumed.
 */
export default async function MyBookingLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ cancelToken: string }>;
}) {
  const { cancelToken } = await params;
  if (!/^[a-z0-9]+$/.test(cancelToken)) notFound();

  const booking = await prisma.booking.findUnique({
    where: { cancelToken },
    select: { timeSlot: { select: { bookingEvent: { select: { owner: true } } } } }
  });
  if (!booking || booking.timeSlot.bookingEvent.owner.status !== "active") {
    notFound();
  }

  return (
    <SiteChrome owner={booking.timeSlot.bookingEvent.owner}>{children}</SiteChrome>
  );
}
