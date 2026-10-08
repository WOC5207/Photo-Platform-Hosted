import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import MyBookingScreen from "@/components/album3d/booking/MyBookingScreen";
import { loadMyBooking } from "@/lib/booking3d";

// A booking's status and edit window change with every visit.
export const dynamic = "force-dynamic";

// The address is the booking's private key, as on the classic page.
export const metadata: Metadata = { referrer: "no-referrer" };

export default async function MyBookingPage({
  params,
  searchParams
}: {
  params: Promise<{ username: string; token: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { username, token } = await params;
  const { new: isNew } = await searchParams;
  const tc = await getTranslations("common");
  const tb = await getTranslations("booking");
  const booking = await loadMyBooking(username, token, await getLocale(), tc("subjectTerm"), (price) =>
    tb("pricePerPersonDisplay", { price })
  );
  return <MyBookingScreen booking={booking} isNew={Boolean(isNew)} />;
}
