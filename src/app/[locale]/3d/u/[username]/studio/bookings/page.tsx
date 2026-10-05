import { getLocale } from "next-intl/server";
import BookingsScreen from "@/components/album3d/studio/BookingsScreen";
import { loadStudioBookings, requireStudioUser } from "@/lib/studio3d";

export const dynamic = "force-dynamic";

export default async function StudioBookingsPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const locale = await getLocale();
  const user = await requireStudioUser(username, locale);
  return <BookingsScreen bookings={await loadStudioBookings(user, locale)} />;
}
