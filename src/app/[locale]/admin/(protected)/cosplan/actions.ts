"use server";

import { Prisma } from "@prisma/client";
import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deleteCosplanTemplateAssets, generateCosplanForeground, validCosplanDimensions } from "@/lib/cosplanStorage";
import { parseCosplanSlots, scaleCosplanSlots } from "@/lib/cosplanTypes";

function refresh() {
  revalidatePath("/admin/cosplan");
  revalidatePath("/cosplan");
}

export async function updateCosplanTemplate(formData: FormData) {
  const locale = await getLocale();
  await requireAdmin(locale);
  const id = String(formData.get("id") ?? "");
  const titleEn = String(formData.get("titleEn") ?? "").trim().slice(0, 120);
  const titleZh = String(formData.get("titleZh") ?? "").trim().slice(0, 120);
  const width = Number(formData.get("width"));
  const height = Number(formData.get("height"));
  if (!id || !titleEn || !titleZh || !validCosplanDimensions(width, height)) return;
  const existing = await prisma.cosplanTemplate.findUnique({
    where: { id },
    select: { id: true, assetToken: true, width: true, height: true, slots: true }
  });
  if (!existing) return;
  const dimensionsChanged = width !== existing.width || height !== existing.height;
  if (!dimensionsChanged) {
    await prisma.cosplanTemplate.update({ where: { id }, data: { titleEn, titleZh } });
    refresh();
    return;
  }
  const slots = scaleCosplanSlots(
    parseCosplanSlots(existing.slots, existing.width, existing.height),
    existing.width,
    existing.height,
    width,
    height
  );
  const foreground = slots.length
    ? await generateCosplanForeground(existing.assetToken, width, height, slots).catch(() => null)
    : null;
  if (slots.length && !foreground) return;
  try {
    await prisma.$transaction(async (tx) => {
      if (foreground) {
        await tx.cosplanTemplateAsset.create({ data: { templateId: id, token: foreground.token, bytes: foreground.bytes } });
      }
      await tx.cosplanTemplate.update({
        where: { id },
        data: {
          titleEn,
          titleZh,
          width,
          height,
          slots: slots as unknown as Prisma.InputJsonValue,
          foregroundToken: foreground?.token ?? null,
          layoutVersion: { increment: 1 }
        }
      });
    });
  } catch {
    if (foreground) await deleteCosplanTemplateAssets([foreground.token]);
    return;
  }
  refresh();
}

export async function toggleCosplanTemplate(formData: FormData) {
  const locale = await getLocale();
  await requireAdmin(locale);
  const id = String(formData.get("id") ?? "");
  const published = formData.get("published") === "true";
  if (!id) return;
  await prisma.cosplanTemplate.updateMany({ where: { id }, data: { published } });
  refresh();
}

export async function moveCosplanTemplate(formData: FormData) {
  const locale = await getLocale();
  await requireAdmin(locale);
  const id = String(formData.get("id") ?? "");
  const direction = formData.get("direction") === "up" ? -1 : 1;
  const ordered = await prisma.cosplanTemplate.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, sortOrder: true } });
  const index = ordered.findIndex((item) => item.id === id);
  const neighbor = ordered[index + direction];
  const current = ordered[index];
  if (!current || !neighbor) return;
  await prisma.$transaction([
    prisma.cosplanTemplate.update({ where: { id: current.id }, data: { sortOrder: neighbor.sortOrder } }),
    prisma.cosplanTemplate.update({ where: { id: neighbor.id }, data: { sortOrder: current.sortOrder } })
  ]);
  refresh();
}

export async function deleteCosplanTemplate(formData: FormData) {
  const locale = await getLocale();
  await requireAdmin(locale);
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const template = await prisma.cosplanTemplate.findUnique({ where: { id }, select: { assets: { select: { token: true } } } });
  if (!template) return;
  await prisma.cosplanTemplate.delete({ where: { id } });
  await deleteCosplanTemplateAssets(template.assets.map((asset) => asset.token));
  refresh();
}
