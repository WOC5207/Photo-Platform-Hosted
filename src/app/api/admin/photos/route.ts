import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { findOwnedEvent } from "@/lib/ownership";
import { config } from "@/lib/config";
import {
  ALLOWED_UPLOAD_TYPES,
  deletePhotoFiles,
  processAndStorePhoto
} from "@/lib/images";
import { adjustReservation, releaseBytes, reserveBytes } from "@/lib/quota";
import { parseCreditsJson, syncCreditProfiles } from "@/lib/photoCredits";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const eventId = form.get("eventId");
  const file = form.get("file");

  if (typeof eventId !== "string" || !(file instanceof File)) {
    return NextResponse.json({ error: "badRequest" }, { status: 400 });
  }

  // Ours, not just any event: this took the posted eventId on trust, so any
  // signed-in user could upload into another photographer's album.
  const event = await findOwnedEvent(eventId, user);
  if (!event) {
    return NextResponse.json({ error: "eventNotFound" }, { status: 404 });
  }

  const ext = ALLOWED_UPLOAD_TYPES[file.type];
  if (!ext) {
    return NextResponse.json({ error: "unsupportedType" }, { status: 415 });
  }
  if (file.size > config.uploadMaxBytes()) {
    return NextResponse.json({ error: "tooLarge" }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  // ID doubles as the on-disk base name; must contain no dashes (the
  // serving route splits on "-").
  const photoId = randomUUID().replace(/-/g, "");

  // Reserve BEFORE writing anything. The point of a quota is that an account
  // over its limit cannot fill the disk, so the check has to precede the write
  // — checking afterwards would only tell us we already lost.
  //
  // Reserve the upload's own size. The original is always kept, so this is a
  // true lower bound; the renditions are charged by the true-up below, once
  // their real size is known.
  //
  // This makes the cap a firm backstop rather than an exact ceiling, and the
  // overshoot is worth being precise about: an accepted upload can finish over
  // quota by whatever the renditions add, which is NOT small — measured at ~1x
  // the upload for incompressible images (webp cannot do much with noise), so
  // an upload can land at roughly double its own size. Bounded by the size of
  // what is in flight, so it matters only when a single file is an appreciable
  // fraction of the whole quota; at 100MB max upload against a 5GB quota it is
  // ~2%. Once over, everything is refused until space is freed, so it cannot
  // compound.
  //
  // The alternative — inflating the reservation to cover renditions — trades
  // that for a worse lie: someone with 3MB free gets told they are full while
  // looking at 3MB of space. A backstop that occasionally overshoots by one
  // file beats a limit that refuses uploads which would have fit.
  const reserved = file.size;
  if (!(await reserveBytes(user.id, reserved))) {
    return NextResponse.json({ error: "quotaExceeded" }, { status: 413 });
  }

  let processed;
  try {
    processed = await processAndStorePhoto(user.id, eventId, photoId, buffer, ext);
  } catch {
    // Nothing was recorded, so nothing else will ever release this reservation.
    await releaseBytes(user.id, reserved);
    return NextResponse.json({ error: "invalidImage" }, { status: 400 });
  }

  const maxOrder = await prisma.photo.aggregate({
    where: { eventId },
    _max: { sortOrder: true }
  });

  // Shared across the whole batch this file was uploaded as part of.
  const credits = parseCreditsJson(form.get("credits"));

  let photo;
  try {
    photo = await prisma.photo.create({
    data: {
      id: photoId,
      eventId,
      filename: processed.origFilename,
      originalName: file.name.slice(0, 300),
      width: processed.width,
      height: processed.height,
      bytes: processed.bytes,
      sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
      exifFocalLengthMm: processed.exif.focalLengthMm,
      exifAperture: processed.exif.aperture,
      exifExposureTime: processed.exif.exposureTime,
      exifIso: processed.exif.iso,
      exifTakenAt: processed.exif.takenAt,
      exifCameraModel: processed.exif.cameraModel,
      exifLensModel: processed.exif.lensModel,
      credits: {
        create: credits.map((c, i) => ({
          creditName: c.creditName,
          subject: c.subject,
          sortOrder: i,
          socialLinks: {
            create: c.socialLinks.map((s, j) => ({
              platform: s.platform,
              url: s.url,
              sortOrder: j
            }))
          }
        }))
      }
    }
    });
  } catch (err) {
    // The files exist but nothing points at them, so they would be invisible to
    // both the user and reconcile(). Remove them and hand the bytes back.
    await deletePhotoFiles(user.id, eventId, photoId, processed.origFilename);
    await releaseBytes(user.id, reserved);
    console.error("Failed to record uploaded photo:", err);
    return NextResponse.json({ error: "unknown" }, { status: 500 });
  }

  // Photo.bytes is now the record of truth for this photo; correct the estimate
  // to match it.
  await adjustReservation(user.id, reserved, processed.bytes);

  await syncCreditProfiles(user.id, credits);

  return NextResponse.json({ id: photo.id });
}
