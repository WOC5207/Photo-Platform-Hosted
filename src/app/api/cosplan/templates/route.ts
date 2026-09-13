import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { cosplanTemplateUrl } from "@/lib/cosplanStorage";
import { parseCosplanSlots } from "@/lib/cosplanTypes";

export async function GET() {
  const templates = await prisma.cosplanTemplate.findMany({
    where: { published: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      titleEn: true,
      titleZh: true,
      assetToken: true,
      foregroundToken: true,
      slots: true,
      layoutVersion: true,
      width: true,
      height: true,
      updatedAt: true
    }
  });

  return NextResponse.json(
    {
      items: templates.map((template) => ({
        ...template,
        imageUrl: cosplanTemplateUrl(template.assetToken),
        foregroundUrl: template.foregroundToken ? cosplanTemplateUrl(template.foregroundToken) : null,
        slots: parseCosplanSlots(template.slots, template.width, template.height)
      }))
    },
    {
      headers: {
        "Cache-Control": "public, max-age=30, stale-while-revalidate=30"
      }
    }
  );
}
