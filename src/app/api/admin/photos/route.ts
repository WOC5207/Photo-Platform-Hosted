import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { findOwnedEvent } from "@/lib/ownership";
import { config } from "@/lib/config";
import { ALLOWED_UPLOAD_TYPES, processAndStorePhoto } from "@/lib/images";
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

  let processed;
  try {
    processed = await processAndStorePhoto(eventId, photoId, buffer, ext);
  } catch {
    return NextResponse.json({ error: "invalidImage" }, { status: 400 });
  }

  const maxOrder = await prisma.photo.aggregate({
    where: { eventId },
    _max: { sortOrder: true }
  });

  // Shared across the whole batch this file was uploaded as part of.
  const credits = parseCreditsJson(form.get("credits"));

  const photo = await prisma.photo.create({
    data: {
      id: photoId,
      eventId,
      filename: processed.origFilename,
      originalName: file.name.slice(0, 300),
      width: processed.width,
      height: processed.height,
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

  await syncCreditProfiles(user.id, credits);

  return NextResponse.json({ id: photo.id });
}
