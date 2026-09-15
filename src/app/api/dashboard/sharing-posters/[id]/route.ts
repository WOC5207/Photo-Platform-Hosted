import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isTrustedMutationOrigin } from "@/lib/requestSecurity";
import {
  defaultSharingPosterComposition,
  parseSharingPosterComposition,
  sharingPosterCompositionSchema
} from "@/lib/sharingPoster";
import {
  resolveSharingPosterPhotos,
  validateSharingPosterPhotoOwnership
} from "@/lib/sharingPosterData";
import { ownerName } from "@/lib/owner";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const locale = request.nextUrl.searchParams.get("locale") === "zh" ? "zh" : "en";
  const project = await prisma.sharingPoster.findFirst({
    where: { id, ownerId: user.id },
    select: { id: true, name: true, revision: true, composition: true, updatedAt: true }
  });
  if (!project) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const composition = parseSharingPosterComposition(
    project.composition,
    defaultSharingPosterComposition(locale, ownerName(user))
  );
  return NextResponse.json(
    {
      ...project,
      composition,
      photos: await resolveSharingPosterPhotos(user.id, locale, composition)
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isTrustedMutationOrigin(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as {
    name?: unknown;
    revision?: unknown;
    composition?: unknown;
  } | null;
  const parsed = sharingPosterCompositionSchema.safeParse(body?.composition);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 120) : "";
  const revision = typeof body?.revision === "number" ? Math.floor(body.revision) : 0;
  if (!parsed.success || !name || revision < 1) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const current = await prisma.sharingPoster.findFirst({
    where: { id, ownerId: user.id },
    select: { composition: true }
  });
  if (!current) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const currentComposition = parseSharingPosterComposition(
    current.composition,
    defaultSharingPosterComposition(parsed.data.outputLocale, ownerName(user))
  );
  const existingIds = new Set(currentComposition.photos.map(({ photoId }) => photoId));
  const addedIds = parsed.data.photos
    .map(({ photoId }) => photoId)
    .filter((photoId) => !existingIds.has(photoId));
  if (
    !(await validateSharingPosterPhotoOwnership(
      user.id,
      addedIds
    ))
  ) {
    return NextResponse.json({ error: "invalid_photos" }, { status: 400 });
  }
  const updated = await prisma.sharingPoster.updateMany({
    where: { id, ownerId: user.id, revision },
    data: {
      name,
      composition: parsed.data as Prisma.InputJsonValue,
      revision: { increment: 1 }
    }
  });
  if (updated.count === 0) {
    const exists = await prisma.sharingPoster.count({ where: { id, ownerId: user.id } });
    return NextResponse.json(
      { error: exists ? "conflict" : "not_found" },
      { status: exists ? 409 : 404 }
    );
  }
  const project = await prisma.sharingPoster.findFirst({
    where: { id, ownerId: user.id },
    select: { revision: true, updatedAt: true }
  });
  return NextResponse.json(project);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isTrustedMutationOrigin(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const deleted = await prisma.sharingPoster.deleteMany({ where: { id, ownerId: user.id } });
  if (!deleted.count) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
