import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveUploadExtension } from "@/lib/images";
import { MultipartUploadError, parseSingleImageMultipart } from "@/lib/multipartUpload";
import { isTrustedMutationOrigin } from "@/lib/requestSecurity";
import { deleteCosplanTemplateAssets, storeCosplanForeground } from "@/lib/cosplanStorage";

async function authorize(request: NextRequest) {
  if (!isTrustedMutationOrigin(request)) return "forbidden" as const;
  const user = await getCurrentUser();
  return user?.role === "admin" ? null : "unauthorized" as const;
}

function refresh() {
  revalidatePath("/admin/cosplan");
  revalidatePath("/cosplan");
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await authorize(request);
  if (denied) return NextResponse.json({ error: denied }, { status: denied === "forbidden" ? 403 : 401 });
  const { id } = await params;
  const template = await prisma.cosplanTemplate.findUnique({
    where: { id },
    select: { id: true, width: true, height: true }
  });
  if (!template) return NextResponse.json({ error: "notFound" }, { status: 404 });

  let upload;
  try {
    upload = await parseSingleImageMultipart(request);
  } catch (error) {
    const tooLarge = error instanceof MultipartUploadError && error.code === "tooLarge";
    return NextResponse.json({ error: tooLarge ? "tooLarge" : "badRequest" }, { status: tooLarge ? 413 : 400 });
  }
  try {
    const extension = resolveUploadExtension(upload.file);
    if (extension !== "png" && extension !== "webp") {
      return NextResponse.json({ error: "unsupportedType" }, { status: 415 });
    }
    const stored = await storeCosplanForeground(upload.file.path, template.width, template.height).catch(() => null);
    if (!stored) return NextResponse.json({ error: "invalidImage" }, { status: 400 });
    try {
      const updated = await prisma.$transaction(async (tx) => {
        await tx.cosplanTemplateAsset.create({
          data: { templateId: template.id, token: stored.token, bytes: stored.bytes }
        });
        return tx.cosplanTemplate.update({
          where: { id: template.id },
          data: { foregroundToken: stored.token, layoutVersion: { increment: 1 } },
          select: { foregroundToken: true, layoutVersion: true }
        });
      });
      refresh();
      return NextResponse.json(updated);
    } catch {
      await deleteCosplanTemplateAssets([stored.token]);
      return NextResponse.json({ error: "saveFailed" }, { status: 500 });
    }
  } finally {
    await upload.cleanup();
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await authorize(request);
  if (denied) return NextResponse.json({ error: denied }, { status: denied === "forbidden" ? 403 : 401 });
  const { id } = await params;
  const updated = await prisma.cosplanTemplate.updateMany({
    where: { id },
    data: { foregroundToken: null, layoutVersion: { increment: 1 } }
  });
  if (!updated.count) return NextResponse.json({ error: "notFound" }, { status: 404 });
  refresh();
  return NextResponse.json({ ok: true });
}
