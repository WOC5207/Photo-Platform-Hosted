import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  defaultSharingPosterComposition,
  parseSharingPosterComposition
} from "@/lib/sharingPoster";
import { getSharingPosterMetadata } from "@/lib/sharingPosterData";
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
    select: { composition: true }
  });
  if (!project) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const composition = parseSharingPosterComposition(
    project.composition,
    defaultSharingPosterComposition(locale, ownerName(user))
  );
  return NextResponse.json(await getSharingPosterMetadata(user.id, locale, composition), {
    headers: { "Cache-Control": "private, no-store" }
  });
}
