import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { prisma } from "@/lib/db";
import { screenPath } from "@/lib/siteMode";

export const dynamic = "force-dynamic";

/**
 * A visitor's own booking link carries only its cancel token; see
 * /3d/book/[token]. "?new=1" (just booked) comes along.
 */
export default async function MyBookingTokenRedirect({
  params,
  searchParams
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { token } = await params;
  const { new: isNew } = await searchParams;
  const locale = await getLocale();
  const booking = /^[a-z0-9]+$/.test(token)
    ? await prisma.booking.findUnique({
        where: { cancelToken: token },
        select: { timeSlot: { select: { bookingEvent: { select: { owner: { select: { username: true } } } } } } }
      })
    : null;
  redirect(
    `/${locale}${
      booking
        ? `${screenPath({ kind: "myBooking", username: booking.timeSlot.bookingEvent.owner.username, token })}${isNew ? "?new=1" : ""}`
        : screenPath({ kind: "title" })
    }`
  );
}
