import { createReadStream, promises as fs } from "fs";
import path from "path";
import { Readable } from "stream";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { eventDir } from "@/lib/images";

const FILE_PATTERN = /^([a-z0-9]+)-(thumb|med|full|orig)\.(webp|jpg|jpeg|png|tif|tiff)$/;

const CONTENT_TYPES: Record<string, string> = {
  webp: "image/webp",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  tif: "image/tiff",
  tiff: "image/tiff"
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

  const photo = await prisma.photo.findFirst({
    where: { id: photoId },
    include: {
      event: {
        select: {
          id: true,
          published: true,
          ownerId: true,
          owner: { select: { status: true } }
        }
      }
    }
  });
  if (!photo || photo.event.id !== eventId) {
    return new NextResponse("Not found", { status: 404 });
  }

  // A suspended account's files go with its pages, for everyone — no owner or
  // admin exception, matching resolveOwner and the /u/ layout.
  //
  // Without this, suspending only hid the gallery page: a published photo takes
  // neither branch below, so it kept serving at a URL that is public, already
  // shared, and cached immutable for a year. Suspension is what you reach for
  // when something has to come down, which is exactly when that fails. An admin
  // who needs to see the content again can unsuspend.
  if (photo.event.owner.status !== "active") {
    return new NextResponse("Not found", { status: 404 });
  }

  const isPending = photo.pendingBatchId !== null;
  if (isPending) {
    // A pending thumbnail is available only as a private queue preview. Other
    // renditions and the temporary source remain unreachable until Create.
    if (variant !== "thumb") {
      return new NextResponse("Not found", { status: 404 });
    }
    const user = await getCurrentUser();
    const allowed =
      user && (user.id === photo.event.ownerId || user.role === "admin");
    if (!allowed) return new NextResponse("Not found", { status: 404 });
  }

  // Originals, and any size of an unpublished album, are for that album's owner
  // (or the platform admin) only. This used to ask merely "is an admin signed
  // in" — which, once anyone can hold an account, would have let every user
  // fetch every other user's originals and unpublished work. The ids are right
  // there in the HTML of pages they can already see, so nothing needs guessing.
  //
  // Still 404 rather than 403: it is the existing convention here and it does
  // not confirm that the photo exists.
  if (!isPending && (variant === "orig" || !photo.event.published)) {
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
      // Queue previews can be regenerated or deleted before Create and must
      // never enter a shared cache. Published filenames are immutable.
      "Cache-Control": isPending
        ? "private, no-store"
        : "public, max-age=31536000, immutable"
    }
  });
}
