import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deleteSiteImageFile, resolveUploadExtension, withImageProcessingSlot } from "@/lib/images";
import { multipartErrorResponse, parseSingleImageMultipart } from "@/lib/multipartUpload";
import { adjustReservation, releaseBytes, reserveBytes } from "@/lib/quota";
import { rateLimit } from "@/lib/rate-limit";
import { isTrustedMutationOrigin } from "@/lib/requestSecurity";
import { sharingPosterLayerUrl } from "@/lib/sharingPoster";
import {
  discardUnusedSharingPosterLayers,
  SHARING_POSTER_LAYER_PURPOSE,
  storeSharingPosterLayer
} from "@/lib/sharingPosterLayers";

export const dynamic = "force-dynamic";

/** Upload an image to place on a poster as a layer. */
export async function POST(request: NextRequest) {
  if (!isTrustedMutationOrigin(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!rateLimit(`poster-layer:${user.id}`, { limit: 20, windowMs: 60_000 })) {
    return NextResponse.json({ error: "rateLimited" }, { status: 429 });
  }

  let upload;
  try {
    upload = await parseSingleImageMultipart(request, user.id);
  } catch (error) {
    const failure = multipartErrorResponse(error);
    return NextResponse.json(failure.body, { status: failure.status });
  }

  try {
    if (!resolveUploadExtension(upload.file)) {
      return NextResponse.json({ error: "invalidImage" }, { status: 400 });
    }
    const reserved = upload.file.size;
    if (!(await reserveBytes(user.id, reserved))) {
      return NextResponse.json({ error: "quotaExceeded" }, { status: 413 });
    }

    let stored: Awaited<ReturnType<typeof storeSharingPosterLayer>>;
    try {
      stored = await withImageProcessingSlot(() => storeSharingPosterLayer(user.id, upload.file.path));
    } catch {
      await releaseBytes(user.id, reserved);
      return NextResponse.json({ error: "invalidImage" }, { status: 400 });
    }

    try {
      await prisma.siteImage.create({
        data: { ownerId: user.id, token: stored.token, purpose: SHARING_POSTER_LAYER_PURPOSE, bytes: stored.bytes }
      });
    } catch {
      await deleteSiteImageFile(user.id, stored.token).catch(() => {});
      await releaseBytes(user.id, reserved);
      return NextResponse.json({ error: "failed" }, { status: 500 });
    }
    await adjustReservation(user.id, reserved, stored.bytes);
    // Uploads that never made it onto a poster are cleared up here.
    await discardUnusedSharingPosterLayers(user.id).catch(() => {});
    return NextResponse.json({
      token: stored.token,
      width: stored.width,
      height: stored.height,
      url: sharingPosterLayerUrl(stored.token)
    });
  } finally {
    await upload.cleanup().catch(() => {});
  }
}
