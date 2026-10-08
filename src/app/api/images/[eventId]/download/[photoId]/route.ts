import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ProcessingQueueFullError, eventDir } from "@/lib/images";
import { originalDownload } from "@/lib/originalDownload";
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
 * camera metadata (see originalDownload). Anyone who can see the photo's
 * public renditions may download it; unpublished, pending or held photos stay
 * with their owner and admins, as on the rendition route. A photographer who
 * turned original downloads off gives visitors the large web rendition
 * instead, while they and admins still get the original.
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
      event: {
        select: {
          published: true,
          ownerId: true,
          owner: { select: { status: true, settings: { select: { originalDownloadsEnabled: true } } } }
        }
      }
    }
  });
  if (!photo || photo.event.owner.status !== "active") return notFound();
  // Only the settled master: pending candidates carry other names.
  if (!new RegExp(`^${photoId}-orig\\.(jpg|jpeg|png|webp|tif|tiff)$`).test(photo.filename)) return notFound();
  const ownerOrAdmin = async () => {
    const user = await getCurrentUser();
    return !!user && (user.id === photo.event.ownerId || user.role === "admin");
  };
  if (photo.pendingBatchId !== null || !moderationAllowsPublicPhoto(photo.moderationStatus) || !photo.event.published) {
    if (!(await ownerOrAdmin())) return notFound();
  }

  const base = path.parse(photo.originalName).name.replace(/[\u0000-\u001f"\\/]/g, "").trim() || photoId;
  const headers = (ext: string, size: number) => {
    const name = `${base}.${ext}`;
    return {
      "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
      "Content-Length": String(size),
      "Content-Disposition": `attachment; filename="${name.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff"
    };
  };

  const originals = photo.event.owner.settings?.originalDownloadsEnabled ?? true;
  if (!originals && !(await ownerOrAdmin())) {
    const fullPath = path.join(eventDir(photo.event.ownerId, eventId), `${photoId}-full.webp`);
    const stat = await fs.stat(fullPath).catch(() => null);
    if (!stat) return notFound();
    return new NextResponse(Readable.toWeb(createReadStream(fullPath)) as ReadableStream<Uint8Array>, {
      headers: headers("webp", stat.size)
    });
  }

  try {
    const file = await originalDownload(photo.event.ownerId, eventId, photo.filename);
    return new NextResponse(file.body(), { headers: headers(file.ext, file.size) });
  } catch (error) {
    if (error instanceof ProcessingQueueFullError) {
      return new NextResponse("Busy, try again shortly", { status: 503, headers: { "Retry-After": "10" } });
    }
    return notFound();
  }
}
