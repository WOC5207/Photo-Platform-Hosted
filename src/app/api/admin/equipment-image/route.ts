import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  deleteSiteImageFile,
  processAndStoreSiteImage,
  resolveUploadExtension,
  withImageProcessingSlot
} from "@/lib/images";
import { MultipartUploadError, parseSingleImageMultipart } from "@/lib/multipartUpload";
import { adjustReservation, releaseBytes, reserveBytes } from "@/lib/quota";
import { isTrustedMutationOrigin } from "@/lib/requestSecurity";
import { discardSiteImage } from "@/lib/siteImages";
import { equipmentPhotoUrl } from "@/lib/equipment";
import { invalidatePublicMedia } from "@/lib/publicMediaCache";

const IMAGE_OPTIONS = {
  prefix: "equipment",
  maxWidth: 1200,
  maxHeight: 1200,
  quality: 86
};

export async function POST(req: NextRequest) {
  if (!isTrustedMutationOrigin(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let upload;
  try {
    upload = await parseSingleImageMultipart(req);
  } catch (error) {
    const tooLarge = error instanceof MultipartUploadError && error.code === "tooLarge";
    return NextResponse.json({ error: tooLarge ? "tooLarge" : "badRequest" }, { status: tooLarge ? 413 : 400 });
  }

  try {
    const equipmentId = upload.fields.get("equipmentId");
    if (typeof equipmentId !== "string" || !equipmentId || !resolveUploadExtension(upload.file)) {
      return NextResponse.json({ error: "badRequest" }, { status: 400 });
    }
    const owned = await prisma.equipmentItem.findFirst({
      where: { id: equipmentId, ownerId: user.id }, select: { id: true }
    });
    if (!owned) return NextResponse.json({ error: "notFound" }, { status: 404 });

    const reserved = upload.file.size;
    if (!(await reserveBytes(user.id, reserved))) {
      return NextResponse.json({ error: "quotaExceeded" }, { status: 413 });
    }

    let stored: { token: string; bytes: number };
    try {
      stored = await withImageProcessingSlot(() =>
        processAndStoreSiteImage(user.id, upload.file.path, IMAGE_OPTIONS)
      );
    } catch {
      await releaseBytes(user.id, reserved);
      return NextResponse.json({ error: "invalidImage" }, { status: 400 });
    }

    let previousToken = "";
    try {
      previousToken = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "EquipmentItem" WHERE id = ${equipmentId} AND "ownerId" = ${user.id} FOR UPDATE`;
        const current = await tx.equipmentItem.findFirst({
          where: { id: equipmentId, ownerId: user.id }, select: { photoToken: true }
        });
        if (!current) throw new Error("equipmentNotFound");
        await tx.siteImage.create({
          data: { ownerId: user.id, token: stored.token, purpose: "equipment", bytes: stored.bytes }
        });
        await tx.equipmentItem.update({
          where: { id: equipmentId }, data: { photoToken: stored.token }
        });
        return current.photoToken;
      });
    } catch {
      await deleteSiteImageFile(user.id, stored.token).catch(() => {});
      await releaseBytes(user.id, reserved);
      return NextResponse.json({ error: "notFound" }, { status: 404 });
    }

    await adjustReservation(user.id, reserved, stored.bytes);
    if (previousToken) await discardSiteImage(user.id, previousToken);
    invalidatePublicMedia();
    return NextResponse.json({ token: stored.token, url: equipmentPhotoUrl(stored.token) });
  } finally {
    await upload.cleanup();
  }
}
