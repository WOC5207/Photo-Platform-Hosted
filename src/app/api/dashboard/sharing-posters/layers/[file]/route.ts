import { createReadStream, promises as fs } from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SHARING_POSTER_LAYER_PURPOSE, sharingPosterLayerPath } from "@/lib/sharingPosterLayers";

export const dynamic = "force-dynamic";

/** A poster layer image, for its owner only. */
export async function GET(_: Request, { params }: { params: Promise<{ file: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Not found", { status: 404 });
  const { file } = await params;
  const token = file.replace(/\.webp$/, "");
  const filePath = file.endsWith(".webp") ? sharingPosterLayerPath(user.id, token) : null;
  if (!filePath) return new NextResponse("Not found", { status: 404 });
  const image = await prisma.siteImage.findFirst({
    where: { token, ownerId: user.id, purpose: SHARING_POSTER_LAYER_PURPOSE },
    select: { id: true }
  });
  if (!image) return new NextResponse("Not found", { status: 404 });
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
  const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream<Uint8Array>;
  return new NextResponse(stream, {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(stat.size),
      // A token names one upload for good, so the owner's browser may keep it.
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      Vary: "Cookie"
    }
  });
}
