import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { getEquipmentMediaMetadata } from "@/lib/publicMediaCache";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const missing = () =>
    new NextResponse("Not found", {
      status: 404,
      headers: { "Cache-Control": "no-store" }
    });
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(token)) {
    return missing();
  }
  const image = await getEquipmentMediaMetadata(token);
  if (!image) return missing();
  const headers = {
    "Content-Type": "image/webp",
    "Content-Length": String(image.size),
    "Cache-Control": "public, max-age=10, must-revalidate",
    ETag: image.etag,
    "X-Content-Type-Options": "nosniff"
  };
  if (req.headers.get("if-none-match")?.split(/\s*,\s*/).includes(image.etag)) {
    return new NextResponse(null, { status: 304, headers });
  }
  return new NextResponse(
    Readable.toWeb(createReadStream(image.filePath)) as ReadableStream<Uint8Array>,
    { headers }
  );
}
