import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  processAndStoreSiteImage,
  resolveUploadExtension,
  siteImageUrl,
  withImageProcessingSlot
} from "@/lib/images";
import { adjustReservation, releaseBytes, reserveBytes } from "@/lib/quota";
import { discardSiteImage } from "@/lib/siteImages";
import { MultipartUploadError, parseSingleImageMultipart } from "@/lib/multipartUpload";
import { isTrustedMutationOrigin } from "@/lib/requestSecurity";

const IMAGE_OPTIONS = {
  prefix: "ann",
  maxWidth: 1600,
  maxHeight: 1600,
  quality: 85
};

/**
 * Uploads an image for one Announcement row, identified by announcementId.
 * Unlike /api/admin/site-image (which always targets the uploader's own
 * settings row), this targets an arbitrary row in a list, so the id has to
 * travel with the upload instead of being implied by a fixed "kind" — which is
 * exactly why the row is re-checked against the uploader below.
 */
export async function POST(req: NextRequest) {
  if (!isTrustedMutationOrigin(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let upload;
  try {
    upload = await parseSingleImageMultipart(req);
  } catch (error) {
    const tooLarge = error instanceof MultipartUploadError && error.code === "tooLarge";
    return NextResponse.json({ error: tooLarge ? "tooLarge" : "badRequest" }, { status: tooLarge ? 413 : 400 });
  }
  const form = upload.fields;
  const announcementId = form.get("announcementId");
  const file = upload.file;

  try {

  if (typeof announcementId !== "string" || announcementId.length === 0) {
    return NextResponse.json({ error: "badRequest" }, { status: 400 });
  }
  if (!resolveUploadExtension(file)) {
    return NextResponse.json({ error: "unsupportedType" }, { status: 415 });
  }

  const existing = await prisma.announcement.findFirst({
    where: { id: announcementId, ownerId: user.id },
    select: { image: true }
  });
  if (!existing) {
    return NextResponse.json({ error: "notFound" }, { status: 404 });
  }

  const reserved = file.size;
  if (!(await reserveBytes(user.id, reserved))) {
    return NextResponse.json({ error: "quotaExceeded" }, { status: 413 });
  }

  let stored;
  try {
    stored = await withImageProcessingSlot(() =>
      processAndStoreSiteImage(user.id, file.path, IMAGE_OPTIONS)
    );
  } catch {
    await releaseBytes(user.id, reserved);
    return NextResponse.json({ error: "invalidImage" }, { status: 400 });
  }

  const { token, bytes } = stored;
  await prisma.$transaction([
    prisma.siteImage.create({
      data: { ownerId: user.id, token, purpose: "announcement", bytes }
    }),
    prisma.announcement.updateMany({
      where: { id: announcementId, ownerId: user.id },
      data: { image: token }
    })
  ]);
  await adjustReservation(user.id, reserved, bytes);

  // Retire the image this one replaced (file, row and its bytes).
  if (existing.image) await discardSiteImage(user.id, existing.image);

  return NextResponse.json({ token, url: siteImageUrl(token) });
  } finally {
    await upload.cleanup();
  }
}
