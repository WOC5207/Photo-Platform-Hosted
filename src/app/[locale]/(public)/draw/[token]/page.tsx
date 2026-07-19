import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { pickText } from "@/lib/content";
import { formatDate } from "@/lib/datetime";
import { findAvailablePublicDraw } from "@/lib/publicLottery";
import { getContactMethods } from "@/lib/settings";
import { getAuthorizedLotteryEntryIds } from "@/lib/visitorSession";
import LotteryEntryForm from "@/components/booking/LotteryEntryForm";

export const dynamic = "force-dynamic";

export default async function LotteryEntryPage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const locale = await getLocale();
  const t = await getTranslations("lotteryEntry");

  if (!/^[a-z0-9]+$/.test(token)) notFound();

  const draw = await findAvailablePublicDraw(token);
  if (!draw) notFound();

  const event = draw.bookingEvent;

  const description = pickText(locale, event.descriptionEn, event.descriptionZh);
  const contactMethods = (await getContactMethods(event.ownerId)).map((m) => ({
    id: m.id,
    label: pickText(locale, m.labelEn, m.labelZh)
  }));

  const authorizedIds = await getAuthorizedLotteryEntryIds();
  const [ownEntry, storedPrizes] = await Promise.all([
    prisma.lotteryEntry.findFirst({
      where: { drawId: draw.id, id: { in: authorizedIds } },
      orderBy: { createdAt: "desc" },
      select: { id: true, token: true, wonPrizeId: true }
    }),
    prisma.lotteryPrize.findMany({
      where: { drawId: draw.id },
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { winners: true } } }
    })
  ]);
  const prizes = storedPrizes.map((p) => ({
    id: p.id,
    name: p.name,
    quantity: p.quantity,
    weight: p.weight,
    wonCount: p._count.winners
  }));

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 rounded-2xl border border-fg/10 bg-page/85 p-6 sm:p-8">
      <div>
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-lg font-semibold">
          {pickText(locale, event.titleEn, event.titleZh)}
        </p>
        <p className="mt-1 text-sm text-fg-subtle">
          {[formatDate(event.date), event.location || null]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {description && (
          <p className="mt-3 whitespace-pre-line text-fg-muted">
            {description}
          </p>
        )}
      </div>

      <LotteryEntryForm
        drawToken={token}
        contactMethods={contactMethods}
        initialEntry={ownEntry}
        prizes={prizes}
      />
    </div>
  );
}
