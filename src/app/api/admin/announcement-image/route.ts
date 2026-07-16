import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { config } from "@/lib/config";
import {
  ALLOWED_UPLOAD_TYPES,
  processAndStoreSiteImage,
  deleteSiteImageFile,
  siteImageUrl
} from "@/lib/images";

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
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const announcementId = form.get("announcementId");
  const file = form.get("file");

  if (typeof announcementId !== "string" || announcementId.length === 0) {
    return NextResponse.json({ error: "badRequest" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "badRequest" }, { status: 400 });
  }
  if (!ALLOWED_UPLOAD_TYPES[file.type]) {
    return NextResponse.json({ error: "unsupportedType" }, { status: 415 });
  }
  if (file.size > config.uploadMaxBytes()) {
    return NextResponse.json({ error: "tooLarge" }, { status: 413 });
  }

  const existing = await prisma.announcement.findFirst({
    where: { id: announcementId, ownerId: user.id },
    select: { image: true }
  });
  if (!existing) {
    return NextResponse.json({ error: "notFound" }, { status: 404 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let token: string;
  try {
    token = await processAndStoreSiteImage(buffer, IMAGE_OPTIONS);
  } catch {
    return NextResponse.json({ error: "invalidImage" }, { status: 400 });
  }

  await prisma.announcement.updateMany({
    where: { id: announcementId, ownerId: user.id },
    data: { image: token }
  });

  // Remove the file the token replaced (best-effort).
  if (existing.image) await deleteSiteImageFile(existing.image);

  return NextResponse.json({ token, url: siteImageUrl(token) });
}
