import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSharingPosterPickerPage } from "@/lib/sharingPosterData";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const locale = request.nextUrl.searchParams.get("locale") === "zh" ? "zh" : "en";
  const page = await getSharingPosterPickerPage({
    ownerId: user.id,
    locale,
    cursor: request.nextUrl.searchParams.get("cursor"),
    eventId: request.nextUrl.searchParams.get("event"),
    credit: request.nextUrl.searchParams.get("credit")
  });
  return NextResponse.json(page, {
    headers: { "Cache-Control": "private, no-store" }
  });
}
