import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { config } from "@/lib/config";
import { adjustReservation, releaseBytes, reserveBytes } from "@/lib/quota";
import { discardSiteImage } from "@/lib/siteImages";
import {
  ALLOWED_UPLOAD_TYPES,
  processAndStoreSiteImage,
  siteImageUrl,
  type SiteImageOptions
} from "@/lib/images";

// Per-kind processing + which settings column the token is stored in.
const KINDS: Record<
  "background" | "logo" | "contactQrEn" | "contactQrZh",
  SiteImageOptions
> = {
  background: { prefix: "bg", maxWidth: 2560, maxHeight: 2560, quality: 82 },
  logo: { prefix: "logo", maxWidth: 512, maxHeight: 512, quality: 90 },
  contactQrEn: { prefix: "qren", maxWidth: 800, maxHeight: 800, quality: 90 },
  contactQrZh: { prefix: "qrzh", maxWidth: 800, maxHeight: 800, quality: 90 }
};

const COLUMN: Record<
  keyof typeof KINDS,
  "backgroundImage" | "logo" | "contactQrImageEn" | "contactQrImageZh"
> = {
  background: "backgroundImage",
  logo: "logo",
  contactQrEn: "contactQrImageEn",
  contactQrZh: "contactQrImageZh"
};

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const kind = form.get("kind");
  const file = form.get("file");

  if (typeof kind !== "string" || !(kind in KINDS)) {
    return NextResponse.json({ error: "badRequest" }, { status: 400 });
  }
  const validKind = kind as keyof typeof KINDS;
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "badRequest" }, { status: 400 });
  }
  if (!ALLOWED_UPLOAD_TYPES[file.type]) {
    return NextResponse.json({ error: "unsupportedType" }, { status: 415 });
  }
  if (file.size > config.uploadMaxBytes()) {
    return NextResponse.json({ error: "tooLarge" }, { status: 413 });
  }

  // Site images count against the quota like photos do — a background can be
  // several megabytes, and leaving them uncounted would be a hole in the cap.
  const reserved = file.size;
  if (!(await reserveBytes(user.id, reserved))) {
    return NextResponse.json({ error: "quotaExceeded" }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let stored;
  try {
    stored = await processAndStoreSiteImage(user.id, buffer, KINDS[validKind]);
  } catch {
    await releaseBytes(user.id, reserved);
    return NextResponse.json({ error: "invalidImage" }, { status: 400 });
  }
  const { token, bytes } = stored;

  const column = COLUMN[validKind];
  const previous = await prisma.siteSettings.findUnique({
    where: { ownerId: user.id },
    select: {
      backgroundImage: true,
      logo: true,
      contactQrImageEn: true,
      contactQrImageZh: true
    }
  });
  const previousToken = previous?.[column];

  const next = { [column]: token };
  await prisma.$transaction([
    prisma.siteImage.create({
      data: { ownerId: user.id, token, purpose: KINDS[validKind].prefix, bytes }
    }),
    prisma.siteSettings.upsert({
      where: { ownerId: user.id },
      create: { ownerId: user.id, ...next },
      update: next
    })
  ]);
  await adjustReservation(user.id, reserved, bytes);

  // Remove the file the token replaced, and stop counting its bytes (both
  // best-effort — a leftover is corrected by reconcile, not by failing here).
  if (previousToken) await discardSiteImage(user.id, previousToken);

  return NextResponse.json({ token, url: siteImageUrl(token) });
}
