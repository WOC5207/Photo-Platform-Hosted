import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { clientIp } from "@/lib/clientIp";
import { rateLimit } from "@/lib/rate-limit";
import { getBangumiCharacterImage } from "@/lib/bangumi";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!rateLimit(`cosplan-image:${clientIp(request.headers)}`, { limit: 120, windowMs: 60_000 })) {
    return new NextResponse("Rate limited", { status: 429 });
  }
  const { id } = await params;
  const characterId = Number(id);
  if (!Number.isInteger(characterId) || characterId <= 0) return new NextResponse("Not found", { status: 404 });
  try {
    const filePath = await getBangumiCharacterImage(characterId);
    const stat = await fs.stat(filePath);
    return new NextResponse(Readable.toWeb(createReadStream(filePath)) as ReadableStream<Uint8Array>, {
      headers: {
        "Content-Type": "image/webp",
        "Content-Length": String(stat.size),
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=518400",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
