import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getPhotoMediaMetadata } from "@/lib/publicMediaCache";

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
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string; file: string }> }
) {
  const { eventId, file } = await params;
  const match = FILE_PATTERN.exec(file);
  if (!match || !/^[a-z0-9]+$/.test(eventId)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const [, photoId, variant, ext] = match;
  const photo = await getPhotoMediaMetadata(eventId, photoId, file);
  if (!photo || !photo.ownerActive) {
    return new NextResponse("Not found", { status: 404 });
  }

  if (photo.pending || photo.moderationHeld) {
    if (photo.pending && variant !== "thumb") {
      return new NextResponse("Not found", { status: 404 });
    }
    const user = await getCurrentUser();
    if (!user || (user.id !== photo.ownerId && user.role !== "admin")) {
      return new NextResponse("Not found", { status: 404 });
    }
  }

  if (
    !photo.pending &&
    !photo.moderationHeld &&
    (variant === "orig" || !photo.published)
  ) {
    const user = await getCurrentUser();
    if (!user || (user.id !== photo.ownerId && user.role !== "admin")) {
      return new NextResponse("Not found", { status: 404 });
    }
  }

  const isPublic =
    !photo.pending &&
    !photo.moderationHeld &&
    variant !== "orig" &&
    photo.published;
  const headers = {
    "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
    "Content-Length": String(photo.size),
    "Cache-Control": isPublic
      ? "public, max-age=10, must-revalidate"
      : "private, no-store",
    ...(isPublic
      ? { ETag: photo.etag }
      : { Vary: "Cookie", "Cross-Origin-Resource-Policy": "same-origin" }),
    "X-Content-Type-Options": "nosniff"
  };
  if (
    isPublic &&
    req.headers.get("if-none-match")?.split(/\s*,\s*/).includes(photo.etag)
  ) {
    return new NextResponse(null, { status: 304, headers });
  }
  return new NextResponse(
    Readable.toWeb(createReadStream(photo.filePath)) as ReadableStream<Uint8Array>,
    { headers }
  );
}
