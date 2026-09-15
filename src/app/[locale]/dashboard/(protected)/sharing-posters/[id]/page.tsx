import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ownerName } from "@/lib/owner";
import { pickText } from "@/lib/content";
import {
  defaultSharingPosterComposition,
  parseSharingPosterComposition
} from "@/lib/sharingPoster";
import { resolveSharingPosterPhotos } from "@/lib/sharingPosterData";
import SharingPosterEditorLoader from "@/components/sharing-posters/SharingPosterEditorLoader";

export default async function SharingPosterEditorPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const locale = await getLocale();
  const user = await requireUser(locale);
  const { id } = await params;
  const [project, events] = await Promise.all([
    prisma.sharingPoster.findFirst({
      where: { id, ownerId: user.id },
      select: { id: true, name: true, revision: true, composition: true }
    }),
    prisma.event.findMany({
      where: { ownerId: user.id },
      orderBy: [{ dateStart: "desc" }, { createdAt: "desc" }],
      select: { id: true, titleEn: true, titleZh: true }
    })
  ]);
  if (!project) notFound();
  const composition = parseSharingPosterComposition(
    project.composition,
    defaultSharingPosterComposition(locale, ownerName(user))
  );
  const photos = await resolveSharingPosterPhotos(user.id, locale, composition);

  return (
    <SharingPosterEditorLoader
      project={{ ...project, composition }}
      initialPhotos={photos}
      events={events.map((event) => ({
        id: event.id,
        title: pickText(locale, event.titleEn, event.titleZh)
      }))}
    />
  );
}
