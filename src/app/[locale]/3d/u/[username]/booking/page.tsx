import { getLocale } from "next-intl/server";
import BoardScreen from "@/components/album3d/booking/BoardScreen";
import { loadBookingBoard } from "@/lib/booking3d";

// Open events and seats left change with every booking.
export const dynamic = "force-dynamic";

export default async function BookingBoardPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return <BoardScreen board={await loadBookingBoard(username, await getLocale())} />;
}
