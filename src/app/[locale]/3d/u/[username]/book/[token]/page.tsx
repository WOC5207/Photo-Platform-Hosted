import { getLocale, getTranslations } from "next-intl/server";
import ScheduleScreen from "@/components/album3d/booking/ScheduleScreen";
import { loadBookingSchedule } from "@/lib/booking3d";

export const dynamic = "force-dynamic";

export default async function BookingSchedulePage({ params }: { params: Promise<{ username: string; token: string }> }) {
  const { username, token } = await params;
  const tc = await getTranslations("common");
  const schedule = await loadBookingSchedule(username, token, await getLocale(), tc("subjectTerm"));
  return <ScheduleScreen schedule={schedule} />;
}
