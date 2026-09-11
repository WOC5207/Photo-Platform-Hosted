import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { getSiteMediaMetadata } from "@/lib/publicMediaCache";

const FILE_PATTERN = /^[a-z0-9]+\.webp$/;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ file: string }> }
) {
  const { file } = await params;
  if (!FILE_PATTERN.test(file)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const token = file.replace(/\.webp$/, "");
  const image = await getSiteMediaMetadata(token, file);
  if (!image) return new NextResponse("Not found", { status: 404 });
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
