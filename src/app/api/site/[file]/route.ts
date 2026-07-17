import { createReadStream, promises as fs } from "fs";
import path from "path";
import { Readable } from "stream";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { siteDir } from "@/lib/images";

// Only tokenised webp names; also serves as path-traversal protection.
const FILE_PATTERN = /^[a-z0-9]+\.webp$/;

export async function GET(
  _req: NextRequest,
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

  const stream = Readable.toWeb(
    createReadStream(filePath)
  ) as ReadableStream<Uint8Array>;

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(stat.size),
      // The token changes on every upload, so caching immutably is safe.
      "Cache-Control": "public, max-age=31536000, immutable"
    }
  });
}
