import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { cosplanTemplatePath } from "@/lib/cosplanStorage";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const filePath = cosplanTemplatePath(token);
  if (!filePath) return new NextResponse("Not found", { status: 404 });
  const asset = await prisma.cosplanTemplateAsset.findUnique({ where: { token }, select: { id: true } });
  if (!asset) return new NextResponse("Not found", { status: 404 });
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat) return new NextResponse("Not found", { status: 404 });
  const etag = `"${stat.size.toString(16)}-${Math.trunc(stat.mtimeMs).toString(16)}"`;
  const headers = {
    "Content-Type": "image/webp",
    "Content-Length": String(stat.size),
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    ETag: etag
  };
  if (request.headers.get("if-none-match")?.split(/\s*,\s*/).includes(etag)) {
    return new NextResponse(null, { status: 304, headers });
  }
  return new NextResponse(Readable.toWeb(createReadStream(filePath)) as ReadableStream<Uint8Array>, { headers });
}
