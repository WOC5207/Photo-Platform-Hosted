import { NextRequest, NextResponse } from "next/server";
import { clientIp } from "@/lib/clientIp";
import { rateLimit } from "@/lib/rate-limit";
import { searchBangumiCharacters } from "@/lib/bangumi";

export async function GET(request: NextRequest) {
  if (!rateLimit(`cosplan-search:${clientIp(request.headers)}`, { limit: 30, windowMs: 60_000 })) {
    return NextResponse.json({ error: "rateLimited" }, { status: 429 });
  }
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const page = Math.max(1, Math.min(50, Number.parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10) || 1));
  if (query.length < 2 || query.length > 80) return NextResponse.json({ error: "invalidQuery" }, { status: 400 });
  try {
    const result = await searchBangumiCharacters(query, page);
    return NextResponse.json({
      ...result,
      page,
      items: result.items.map((item) => ({
        id: item.id,
        name: item.name,
        nameCn: item.nameCn,
        thumbnailUrl: item.imageUrl,
        imageUrl: item.imageUrl ? `/api/cosplan/characters/${item.id}/image` : "",
        sourceUrl: item.sourceUrl
      }))
    }, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=540" } });
  } catch {
    return NextResponse.json({ error: "providerUnavailable" }, { status: 502 });
  }
}
