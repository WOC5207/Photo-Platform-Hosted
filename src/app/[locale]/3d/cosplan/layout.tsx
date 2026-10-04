import { getLocale } from "next-intl/server";
import { prisma } from "@/lib/db";
import { pickText } from "@/lib/content";
import { cosplanTemplateUrl } from "@/lib/cosplanStorage";
import { parseCosplanSlots } from "@/lib/cosplanTypes";
import CosplanStudioProvider from "@/components/album3d/creators/cosplan/CosplanStudio";

/**
 * The 3D Cosplan creator's steps share one working draft, kept here so it
 * survives moving between the backgrounds, the board and printing. The
 * published backgrounds are the classic creator's (/cosplan).
 */
export default async function CosplanLayout({ children }: { children: React.ReactNode }) {
  const [locale, templates] = await Promise.all([
    getLocale(),
    prisma.cosplanTemplate.findMany({ where: { published: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] })
  ]);
  const summaries = templates.map((template) => ({
    id: template.id,
    title: pickText(locale, template.titleEn, template.titleZh),
    titleEn: template.titleEn,
    titleZh: template.titleZh,
    assetToken: template.assetToken,
    imageUrl: cosplanTemplateUrl(template.assetToken),
    foregroundToken: template.foregroundToken,
    foregroundUrl: template.foregroundToken ? cosplanTemplateUrl(template.foregroundToken) : null,
    layoutVersion: template.layoutVersion,
    slots: parseCosplanSlots(template.slots, template.width, template.height),
    width: template.width,
    height: template.height
  }));
  return <CosplanStudioProvider templates={summaries}>{children}</CosplanStudioProvider>;
}
