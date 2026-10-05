import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ProcessingQueueFullError, downloadableOriginal } from "@/lib/images";
import { moderationAllowsPublicPhoto } from "@/lib/photoVisibility";
import { prisma } from "@/lib/db";

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  tif: "image/tiff",
  tiff: "image/tiff"
};

/**
 * Downloads a photo at full resolution: the master as uploaded, minus any
 * camera metadata (see downloadableOriginal). Anyone who can see the photo's
 * public renditions may download it; unpublished, pending or held photos stay
 * with their owner and admins, as on the rendition route.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ eventId: string; photoId: string }> }) {
  const { eventId, photoId } = await params;
  const notFound = () => new NextResponse("Not found", { status: 404 });
  if (!/^[a-z0-9]+$/.test(eventId) || !/^[a-z0-9]+$/.test(photoId)) return notFound();

  const photo = await prisma.photo.findFirst({
    where: { id: photoId, eventId },
    select: {
      filename: true,
      originalName: true,
      pendingBatchId: true,
      moderationStatus: true,
      event: { select: { published: true, ownerId: true, owner: { select: { status: true } } } }
    }
  });
  if (!photo || photo.event.owner.status !== "active") return notFound();
  // Only the settled master: pending candidates carry other names.
  if (!new RegExp(`^${photoId}-orig\\.(jpg|jpeg|png|webp|tif|tiff)$`).test(photo.filename)) return notFound();
  if (photo.pendingBatchId !== null || !moderationAllowsPublicPhoto(photo.moderationStatus) || !photo.event.published) {
    const user = await getCurrentUser();
    if (!user || (user.id !== photo.event.ownerId && user.role !== "admin")) return notFound();
  }

  let file: { filePath: string; ext: string };
  try {
    file = await downloadableOriginal(photo.event.ownerId, eventId, photoId, photo.filename);
  } catch (error) {
    if (error instanceof ProcessingQueueFullError) {
      return new NextResponse("Busy, try again shortly", { status: 503, headers: { "Retry-After": "10" } });
    }
    return notFound();
  }
  const stat = await fs.stat(file.filePath).catch(() => null);
  if (!stat) return notFound();

  const base = path.parse(photo.originalName).name.replace(/[\u0000-\u001f"\\/]/g, "").trim() || photoId;
  const name = `${base}.${file.ext}`;
  return new NextResponse(Readable.toWeb(createReadStream(file.filePath)) as ReadableStream<Uint8Array>, {
    headers: {
      "Content-Type": CONTENT_TYPES[file.ext] ?? "application/octet-stream",
      "Content-Length": String(stat.size),
      "Content-Disposition": `attachment; filename="${name.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
