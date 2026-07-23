import { createReadStream, promises as fs } from "fs";
import path from "path";
import { Readable } from "stream";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { siteDir } from "@/lib/images";

// Only tokenised webp names; also serves as path-traversal protection.
const FILE_PATTERN = /^[a-z0-9]+\.webp$/;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ file: string }> }
) {
  const { file } = await params;
  if (!FILE_PATTERN.test(file)) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Site images live under their owner's directory now, and the URL is only a
  // token — so the owner has to be looked up before the file can be found.
  // Stays unauthenticated: these are logos, backgrounds and QR codes shown on
  // public pages, and the token is random.
  //
  // That same lookup carries the owner's status: a suspended account's logo and
  // QR codes come down with the rest of its site, the same rule the images
  // route applies to photos.
  const token = file.replace(/\.webp$/, "");
  const image = await prisma.siteImage.findUnique({
    where: { token },
    select: { ownerId: true, owner: { select: { status: true } } }
  });
  if (!image || image.owner.status !== "active") {
    return new NextResponse("Not found", { status: 404 });
  }

  const filePath = path.join(siteDir(image.ownerId), file);
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  const etag = `"${stat.size.toString(16)}-${Math.trunc(stat.mtimeMs).toString(16)}"`;
  const commonHeaders = {
    "Content-Type": "image/webp",
    "Cache-Control": "public, max-age=0, must-revalidate",
    ETag: etag,
    "X-Content-Type-Options": "nosniff"
  };

  // Site-image tokens are stable until replacement, so conditional requests
  // retain the bandwidth benefit of caching. Revalidation is still required:
  // otherwise a suspended account's cached logo, background or QR code would
  // remain visible for the old one-year immutable lifetime.
  if (req.headers.get("if-none-match")?.split(/\s*,\s*/).includes(etag)) {
    return new NextResponse(null, {
      status: 304,
      headers: commonHeaders
    });
  }

  const stream = Readable.toWeb(
    createReadStream(filePath)
  ) as ReadableStream<Uint8Array>;
  return new NextResponse(stream, {
    headers: {
      ...commonHeaders,
      "Content-Length": String(stat.size)
    }
  });
}
