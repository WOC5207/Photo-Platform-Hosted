import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isTrustedMutationOrigin } from "@/lib/requestSecurity";
import { sharingPosterCompositionSchema } from "@/lib/sharingPoster";
import { validateSharingPosterPhotoOwnership } from "@/lib/sharingPosterData";
import type { Prisma } from "@prisma/client";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isTrustedMutationOrigin(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const source = await prisma.sharingPoster.findFirst({
    where: { id, ownerId: user.id },
    select: { name: true, composition: true }
  });
  if (!source) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { name?: unknown; composition?: unknown } | null;
  const requestedComposition = body?.composition === undefined
    ? null
    : sharingPosterCompositionSchema.safeParse(body.composition);
  if (requestedComposition && !requestedComposition.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const composition = requestedComposition?.success
    ? requestedComposition.data
    : source.composition;
  const sourceParsed = sharingPosterCompositionSchema.safeParse(source.composition);
  const sourceIds = new Set(
    sourceParsed.success ? sourceParsed.data.photos.map(({ photoId }) => photoId) : []
  );
  const addedIds = requestedComposition?.success
    ? requestedComposition.data.photos
        .map(({ photoId }) => photoId)
        .filter((photoId) => !sourceIds.has(photoId))
    : [];
  if (addedIds.length && !(await validateSharingPosterPhotoOwnership(user.id, addedIds))) {
    return NextResponse.json({ error: "invalid_photos" }, { status: 400 });
  }
  const requestedName = typeof body?.name === "string" ? body.name.trim().slice(0, 120) : "";
  const copy = await prisma.sharingPoster.create({
    data: {
      ownerId: user.id,
      name: requestedName || `${source.name} — Copy`.slice(0, 120),
      composition: composition as Prisma.InputJsonValue
    },
    select: { id: true }
  });
  return NextResponse.json(copy, { status: 201 });
}
