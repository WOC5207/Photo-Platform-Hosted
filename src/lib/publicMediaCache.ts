import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import { unstable_cache, revalidateTag } from "next/cache";
import { prisma } from "@/lib/db";
import { eventDir, siteDir } from "@/lib/images";
import { moderationAllowsPublicPhoto } from "@/lib/photoVisibility";

const MEDIA_REVALIDATE_SECONDS = Math.max(
  1,
  Number.parseInt(process.env.PUBLIC_MEDIA_METADATA_TTL_SECONDS ?? "20", 10) || 20
);

function buildEtag(size: number, mtimeMs: number) {
  return `"${size.toString(16)}-${Math.trunc(mtimeMs).toString(16)}"`;
}

export async function getPhotoMediaMetadata(eventId: string, photoId: string, file: string) {
  return unstable_cache(
    async () => {
      const photo = await prisma.photo.findFirst({
        where: { id: photoId },
        select: {
          pendingBatchId: true,
          moderationStatus: true,
          event: { select: { id: true, published: true, ownerId: true, owner: { select: { status: true } } } }
        }
      });
      if (!photo || photo.event.id !== eventId) return null;
      const filePath = path.join(eventDir(photo.event.ownerId, eventId), file);
      try {
        const stat = await fs.stat(filePath);
        return {
          filePath,
          size: stat.size,
          etag: buildEtag(stat.size, stat.mtimeMs),
          ownerId: photo.event.ownerId,
          ownerActive: photo.event.owner.status === "active",
          published: photo.event.published,
          pending: photo.pendingBatchId !== null,
          moderationHeld: !moderationAllowsPublicPhoto(photo.moderationStatus)
        };
      } catch {
        return null;
      }
    },
    ["public-photo-media", eventId, photoId, file],
    { revalidate: MEDIA_REVALIDATE_SECONDS, tags: ["public-media", `event:${eventId}`, `photo:${photoId}`] }
  )();
}

export async function getSiteMediaMetadata(token: string, file: string) {
  return unstable_cache(
    async () => {
      const image = await prisma.siteImage.findFirst({
        where: { token, purpose: { in: ["bg", "logo", "qren", "qrzh", "announcement"] } },
        select: { ownerId: true, owner: { select: { status: true } } }
      });
      if (!image || image.owner.status !== "active") return null;
      const filePath = path.join(siteDir(image.ownerId), file);
      try {
        const stat = await fs.stat(filePath);
        return { filePath, size: stat.size, etag: buildEtag(stat.size, stat.mtimeMs) };
      } catch {
        return null;
      }
    },
    ["public-site-media", token, file],
    { revalidate: MEDIA_REVALIDATE_SECONDS, tags: ["public-media", `site-image:${token}`] }
  )();
}

export async function getEquipmentMediaMetadata(qrToken: string) {
  return unstable_cache(
    async () => {
      const item = await prisma.equipmentItem.findFirst({
        where: { qrToken, owner: { status: "active" } },
        select: { ownerId: true, photoToken: true }
      });
      if (!item || !/^equipment[a-z0-9]+$/.test(item.photoToken)) return null;
      const image = await prisma.siteImage.findFirst({
        where: { token: item.photoToken, ownerId: item.ownerId, purpose: "equipment" },
        select: { id: true }
      });
      if (!image) return null;
      const filePath = path.join(siteDir(item.ownerId), `${item.photoToken}.webp`);
      try {
        const stat = await fs.stat(filePath);
        return { filePath, size: stat.size, etag: buildEtag(stat.size, stat.mtimeMs) };
      } catch {
        return null;
      }
    },
    ["public-equipment-media", qrToken],
    { revalidate: MEDIA_REVALIDATE_SECONDS, tags: ["public-media", `equipment:${qrToken}`] }
  )();
}

export function invalidatePublicMedia(tags: string[] = []) {
  revalidateTag("public-media");
  revalidateTag("public-content");
  for (const tag of tags) revalidateTag(tag);
}
