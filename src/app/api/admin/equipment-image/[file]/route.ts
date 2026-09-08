import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { siteDir } from "@/lib/images";

const FILE_PATTERN = /^equipment[a-z0-9]+\.webp$/;

export async function GET(_: Request, { params }: { params: Promise<{ file: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Not found", { status: 404 });
  const { file } = await params;
  if (!FILE_PATTERN.test(file)) return new NextResponse("Not found", { status: 404 });
  const token = file.replace(/\.webp$/, "");
  const image = await prisma.siteImage.findFirst({
    where: { token, ownerId: user.id, purpose: "equipment" }, select: { ownerId: true }
  });
  if (!image) return new NextResponse("Not found", { status: 404 });
  const filePath = path.join(siteDir(image.ownerId), file);
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
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      Vary: "Cookie"
    }
  });
}
