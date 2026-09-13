import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseCosplanSlots } from "@/lib/cosplanTypes";
import { deleteCosplanTemplateAssets, generateCosplanForeground } from "@/lib/cosplanStorage";
import { isTrustedMutationOrigin } from "@/lib/requestSecurity";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isTrustedMutationOrigin(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const template = await prisma.cosplanTemplate.findUnique({
    where: { id },
    select: { id: true, assetToken: true, width: true, height: true }
  });
  if (!template) return NextResponse.json({ error: "notFound" }, { status: 404 });

  const body = await request.json().catch(() => null) as { slots?: unknown } | null;
  if (!body || !Array.isArray(body.slots)) {
    return NextResponse.json({ error: "invalidLayout" }, { status: 400 });
  }
  const slots = parseCosplanSlots(body.slots, template.width, template.height);
  if (slots.length !== body.slots.length) {
    return NextResponse.json({ error: "invalidLayout" }, { status: 400 });
  }

  const foreground = slots.length
    ? await generateCosplanForeground(template.assetToken, template.width, template.height, slots).catch(() => null)
    : null;
  if (slots.length && !foreground) {
    return NextResponse.json({ error: "foregroundFailed" }, { status: 500 });
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      if (foreground) {
        await tx.cosplanTemplateAsset.create({
          data: { templateId: template.id, token: foreground.token, bytes: foreground.bytes }
        });
      }
      return tx.cosplanTemplate.update({
        where: { id: template.id },
        data: {
          slots: slots as unknown as Prisma.InputJsonValue,
          foregroundToken: foreground?.token ?? null,
          layoutVersion: { increment: 1 }
        },
        select: { layoutVersion: true, foregroundToken: true }
      });
    });
    revalidatePath("/admin/cosplan");
    revalidatePath("/cosplan");
    return NextResponse.json({
      slots,
      layoutVersion: updated.layoutVersion,
      foregroundToken: updated.foregroundToken
    });
  } catch {
    if (foreground) await deleteCosplanTemplateAssets([foreground.token]);
    return NextResponse.json({ error: "saveFailed" }, { status: 500 });
  }
}
