import { getLocale, getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ownerName } from "@/lib/owner";
import {
  defaultSharingPosterComposition,
  parseSharingPosterComposition
} from "@/lib/sharingPoster";
import PageHeader from "@/components/ui/PageHeader";
import PaginationNav from "@/components/ui/PaginationNav";
import SharingPosterProjectList, {
  NewSharingPosterButton
} from "@/components/sharing-posters/SharingPosterProjectList";

export default async function SharingPostersPage({
  searchParams
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const locale = await getLocale();
  const user = await requireUser(locale);
  const t = await getTranslations("sharingPosters");
  const requested = Number((await searchParams).page ?? "1");
  const page = Number.isInteger(requested) && requested > 0 ? requested : 1;
  const take = 50;
  const [rows, total] = await Promise.all([
    prisma.sharingPoster.findMany({
      where: { ownerId: user.id },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * take,
      take,
      select: { id: true, name: true, updatedAt: true, composition: true }
    }),
    prisma.sharingPoster.count({ where: { ownerId: user.id } })
  ]);
  const formatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const fallback = defaultSharingPosterComposition(locale, ownerName(user));
  const projects = rows.map((row) => {
    const composition = parseSharingPosterComposition(row.composition, fallback);
    return {
      id: row.id,
      name: row.name,
      photoCount: composition.photos.length,
      ratioLabel: `${composition.ratio.width}:${composition.ratio.height}`,
      updatedLabel: formatter.format(row.updatedAt)
    };
  });
  const totalPages = Math.max(1, Math.ceil(total / take));

  return (
    <div className="space-y-8">
      <PageHeader
        index="SP"
        title={t("title")}
        description={t("description")}
        action={total > 0 ? <NewSharingPosterButton /> : undefined}
      />
      <SharingPosterProjectList projects={projects} />
      <PaginationNav
        page={page}
        totalPages={totalPages}
        path="/dashboard/sharing-posters"
        labels={{
          navigation: t("pagination"),
          previous: t("previous"),
          next: t("next"),
          count: t("pageCount", { page, total: totalPages })
        }}
      />
    </div>
  );
}
