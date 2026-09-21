import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ownerName } from "@/lib/owner";
import { isTrustedMutationOrigin } from "@/lib/requestSecurity";
import {
  defaultSharingPosterComposition,
  SHARING_POSTER_MAX_PHOTOS,
  sharingPosterMetadataFromPhotos,
  withSharingPosterMetadata
} from "@/lib/sharingPoster";
import { getSharingPosterPhotosByIds } from "@/lib/sharingPosterData";

export const dynamic = "force-dynamic";

function localeValue(value: unknown): "en" | "zh" {
  return value === "zh" ? "zh" : "en";
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const cursor = request.nextUrl.searchParams.get("cursor");
  const offset = cursor && /^\d+$/.test(cursor) ? Number(cursor) : 0;
  const take = 50;
  const [rows, total] = await Promise.all([
    prisma.sharingPoster.findMany({
      where: { ownerId: user.id },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip: Math.min(offset, 100_000),
      take: take + 1,
      select: { id: true, name: true, revision: true, updatedAt: true, composition: true }
    }),
    prisma.sharingPoster.count({ where: { ownerId: user.id } })
  ]);
  return NextResponse.json(
    {
      items: rows.slice(0, take),
      nextCursor: rows.length > take ? String(offset + take) : null,
      total
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function POST(request: NextRequest) {
  if (!isTrustedMutationOrigin(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    name?: unknown;
    locale?: unknown;
    photoIds?: unknown;
  } | null;
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 120) : "";
  const locale = localeValue(body?.locale);
  const photoIds = Array.isArray(body?.photoIds)
    ? body.photoIds.filter((id): id is string => typeof id === "string")
    : [];
  if (
    photoIds.length > SHARING_POSTER_MAX_PHOTOS ||
    new Set(photoIds).size !== photoIds.length
  ) {
    return NextResponse.json({ error: "invalid_photos" }, { status: 400 });
  }

  const selected = await getSharingPosterPhotosByIds(user.id, locale, photoIds);
  if (selected.length !== photoIds.length) {
    // Deliberately indistinguishable for missing, held, and foreign photos.
    return NextResponse.json({ error: "invalid_photos" }, { status: 400 });
  }

  const composition = defaultSharingPosterComposition(
    locale,
    ownerName(user),
    selected.map((photo) => ({ id: photo.id, homeWeight: photo.homeWeight }))
  );
  composition.credits.lines = withSharingPosterMetadata(
    composition.credits.lines,
    sharingPosterMetadataFromPhotos(selected)
  );
  composition.credits.cosplayerReviewed = selected.every(
    (photo) => photo.creditNames.length > 0
  );
  const project = await prisma.sharingPoster.create({
    data: {
      ownerId: user.id,
      name: name || (locale === "zh" ? "未命名分享海报" : "Untitled sharing poster"),
      composition: composition as Prisma.InputJsonValue
    },
    select: { id: true, revision: true }
  });
  return NextResponse.json(project, { status: 201 });
}
