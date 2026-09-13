import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { MultipartUploadError, parseSingleImageMultipart } from "@/lib/multipartUpload";
import { isTrustedMutationOrigin } from "@/lib/requestSecurity";
import { resolveUploadExtension } from "@/lib/images";
import { cosplanTemplateUrl, deleteCosplanTemplateAssets, generateCosplanForeground, storeCosplanTemplate, validCosplanDimensions } from "@/lib/cosplanStorage";
import { parseCosplanSlots, scaleCosplanSlots } from "@/lib/cosplanTypes";

function text(form: Map<string, string>, key: string, max: number) {
  return (form.get(key) ?? "").trim().slice(0, max);
}

export async function POST(request: NextRequest) {
  if (!isTrustedMutationOrigin(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let upload;
  try {
    upload = await parseSingleImageMultipart(request);
  } catch (error) {
    const tooLarge = error instanceof MultipartUploadError && error.code === "tooLarge";
    return NextResponse.json({ error: tooLarge ? "tooLarge" : "badRequest" }, { status: tooLarge ? 413 : 400 });
  }

  try {
    const titleEn = text(upload.fields, "titleEn", 120);
    const titleZh = text(upload.fields, "titleZh", 120);
    const templateId = text(upload.fields, "templateId", 64);
    const width = Number(upload.fields.get("width"));
    const height = Number(upload.fields.get("height"));
    if (!titleEn || !titleZh || !validCosplanDimensions(width, height)) {
      return NextResponse.json({ error: "invalidFields" }, { status: 400 });
    }
    if (!resolveUploadExtension(upload.file)) {
      return NextResponse.json({ error: "unsupportedType" }, { status: 415 });
    }

    const stored = await storeCosplanTemplate(upload.file.path, width, height).catch(() => null);
    if (!stored) return NextResponse.json({ error: "invalidImage" }, { status: 400 });
    const generatedTokens: string[] = [];
    try {
      if (templateId) {
        const existing = await prisma.cosplanTemplate.findUnique({
          where: { id: templateId },
          select: { id: true, width: true, height: true, slots: true }
        });
        if (!existing) {
          await deleteCosplanTemplateAssets([stored.token]);
          return NextResponse.json({ error: "notFound" }, { status: 404 });
        }
        const slots = scaleCosplanSlots(
          parseCosplanSlots(existing.slots, existing.width, existing.height),
          existing.width,
          existing.height,
          width,
          height
        );
        const foreground = slots.length
          ? await generateCosplanForeground(stored.token, width, height, slots).catch(() => null)
          : null;
        if (slots.length && !foreground) {
          await deleteCosplanTemplateAssets([stored.token]);
          return NextResponse.json({ error: "foregroundFailed" }, { status: 500 });
        }
        if (foreground) generatedTokens.push(foreground.token);
        const template = await prisma.$transaction(async (tx) => {
          await tx.cosplanTemplateAsset.create({ data: { templateId, token: stored.token, bytes: stored.bytes } });
          if (foreground) {
            await tx.cosplanTemplateAsset.create({ data: { templateId, token: foreground.token, bytes: foreground.bytes } });
          }
          return tx.cosplanTemplate.update({
            where: { id: templateId },
            data: {
              titleEn,
              titleZh,
              width,
              height,
              assetToken: stored.token,
              slots: slots as unknown as Prisma.InputJsonValue,
              foregroundToken: foreground?.token ?? null,
              layoutVersion: { increment: 1 }
            }
          });
        });
        return NextResponse.json({ template: { ...template, imageUrl: cosplanTemplateUrl(stored.token) } });
      }

      const maximum = await prisma.cosplanTemplate.aggregate({ _max: { sortOrder: true } });
      const template = await prisma.$transaction(async (tx) => {
        const created = await tx.cosplanTemplate.create({
          data: { titleEn, titleZh, width, height, assetToken: stored.token, sortOrder: (maximum._max.sortOrder ?? -1) + 1 }
        });
        await tx.cosplanTemplateAsset.create({ data: { templateId: created.id, token: stored.token, bytes: stored.bytes } });
        return created;
      });
      return NextResponse.json({ template: { ...template, imageUrl: cosplanTemplateUrl(stored.token) } }, { status: 201 });
    } catch {
      await deleteCosplanTemplateAssets([stored.token, ...generatedTokens]);
      return NextResponse.json({ error: "saveFailed" }, { status: 500 });
    }
  } finally {
    await upload.cleanup();
  }
}
