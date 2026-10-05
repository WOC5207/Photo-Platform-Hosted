import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import BookingDetailsScreen from "@/components/album3d/studio/BookingDetailsScreen";
import { loadStudioBookingSettings, requireStudioUser } from "@/lib/studio3d";

export const dynamic = "force-dynamic";

export default async function StudioBookingDetailsPage({ params }: { params: Promise<{ username: string; id: string }> }) {
  const { username, id } = await params;
  const locale = await getLocale();
  const user = await requireStudioUser(username, locale);
  const booking = await loadStudioBookingSettings(user, id, locale);
  if (!booking) notFound();
  return <BookingDetailsScreen booking={booking} />;
}
