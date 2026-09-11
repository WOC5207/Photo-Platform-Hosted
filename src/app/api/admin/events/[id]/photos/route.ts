import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getAdminPhotoPage } from "@/lib/adminPhotoPage";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const cursor = req.nextUrl.searchParams.get("cursor");
  const page = await getAdminPhotoPage({ eventId: id, ownerId: user.id, cursor });
  if (!page) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(page, { headers: { "Cache-Control": "private, no-store" } });
}
