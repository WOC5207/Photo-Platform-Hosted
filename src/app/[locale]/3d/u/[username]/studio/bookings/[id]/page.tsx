import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import BookingScreen from "@/components/album3d/studio/BookingScreen";
import { loadStudioSchedule, requireStudioUser, studioAccount } from "@/lib/studio3d";

export const dynamic = "force-dynamic";

export default async function StudioBookingPage({ params }: { params: Promise<{ username: string; id: string }> }) {
  const { username, id } = await params;
  const locale = await getLocale();
  const user = await requireStudioUser(username, locale);
  const schedule = await loadStudioSchedule(user, id, locale);
  if (!schedule) notFound();
  return <BookingScreen account={studioAccount(user)} schedule={schedule} />;
}
