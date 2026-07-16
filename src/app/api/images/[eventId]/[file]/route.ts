import { createReadStream, promises as fs } from "fs";
import path from "path";
import { Readable } from "stream";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { eventDir } from "@/lib/images";

const FILE_PATTERN = /^([a-z0-9]+)-(thumb|med|full|orig)\.(webp|jpg|jpeg|png)$/;

const CONTENT_TYPES: Record<string, string> = {
  webp: "image/webp",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png"
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ eventId: string; file: string }> }
) {
  const { eventId, file } = await params;

  // Strict pattern check doubles as path-traversal protection.
  const match = FILE_PATTERN.exec(file);
  if (!match || !/^[a-z0-9]+$/.test(eventId)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const [, photoId, variant, ext] = match;

  const photo = await prisma.photo.findUnique({
    where: { id: photoId },
    include: { event: { select: { id: true, published: true, ownerId: true } } }
  });
  if (!photo || photo.event.id !== eventId) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Originals, and any size of an unpublished album, are for that album's owner
  // (or the platform admin) only. This used to ask merely "is an admin signed
  // in" — which, once anyone can hold an account, would have let every user
  // fetch every other user's originals and unpublished work. The ids are right
  // there in the HTML of pages they can already see, so nothing needs guessing.
  //
  // Still 404 rather than 403: it is the existing convention here and it does
  // not confirm that the photo exists.
  if (variant === "orig" || !photo.event.published) {
    const user = await getCurrentUser();
    const allowed =
      user && (user.id === photo.event.ownerId || user.role === "admin");
    if (!allowed) return new NextResponse("Not found", { status: 404 });
  }

  // Path from the record's owner, not the URL: the URL carries no owner, so
  // there is nothing here that could disagree with the row.
  const filePath = path.join(eventDir(photo.event.ownerId, eventId), file);
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
      "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
      "Content-Length": String(stat.size),
      // Filenames are unique per photo, so long immutable caching is safe.
      "Cache-Control": "public, max-age=31536000, immutable"
    }
  });
}
