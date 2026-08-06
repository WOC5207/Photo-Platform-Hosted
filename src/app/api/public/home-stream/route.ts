import { NextRequest, NextResponse } from "next/server";
import { findOwner } from "@/lib/owner";
import { getHomePhotoStreamPage } from "@/lib/homePhotoStream";
import { clientIp } from "@/lib/clientIp";
import { rateLimit } from "@/lib/rate-limit";

const EMPTY_PAGE = { events: [], nextCursor: null };

export async function GET(req: NextRequest) {
  const username = (req.nextUrl.searchParams.get("owner") ?? "")
    .trim()
    .slice(0, 80);
  const owner = username ? await findOwner(username) : null;

  if (!owner) {
    return NextResponse.json(EMPTY_PAGE, {
      status: 404,
      headers: { "Cache-Control": "private, no-store" }
    });
  }

  if (
    !rateLimit(`home-stream:${owner.id}:${clientIp(req.headers)}`, {
      limit: 120,
      windowMs: 60 * 1000
    })
  ) {
    return NextResponse.json(EMPTY_PAGE, {
      status: 429,
      headers: {
        "Cache-Control": "private, no-store",
        "Retry-After": "60"
      }
    });
  }

  const cursor = (req.nextUrl.searchParams.get("cursor") ?? "")
    .trim()
    .slice(0, 80);
  const locale = req.nextUrl.searchParams.get("locale") === "zh" ? "zh" : "en";
  const page = await getHomePhotoStreamPage({
    ownerId: owner.id,
    locale,
    cursor: cursor || null
  });

  return NextResponse.json(page, {
    headers: { "Cache-Control": "private, no-store" }
  });
}
