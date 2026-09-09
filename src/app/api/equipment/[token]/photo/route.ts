import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { siteDir } from "@/lib/images";

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const item = await prisma.equipmentItem.findFirst({ where: { qrToken: token, owner: { status: "active" } }, select: { ownerId: true, photoToken: true } });
  const missing = () => new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  if (!item || !/^equipment[a-z0-9]+$/.test(item.photoToken)) return missing();
  const image = await prisma.siteImage.findFirst({ where: { token: item.photoToken, ownerId: item.ownerId, purpose: "equipment" }, select: { id: true } });
  if (!image) return missing();
  const file = path.join(siteDir(item.ownerId), `${item.photoToken}.webp`);
  try {
    const stat = await fs.stat(file);
    return new NextResponse(Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>, { headers: {
      "Content-Type": "image/webp", "Content-Length": String(stat.size), "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"
    } });
  } catch { return missing(); }
}
