import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { config } from "@/lib/config";
import { ensureLotteryDraw } from "@/lib/lottery";
import { getSiteSettings } from "@/lib/settings";
import { Link } from "@/i18n/navigation";
import CopyButton from "@/components/admin/CopyButton";
import LotteryOpenToggle from "@/components/admin/LotteryOpenToggle";
import LotteryManager from "@/components/admin/LotteryManager";

export default async function LotteryPage({
  params
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  const user = await requireUser(locale);
  const t = await getTranslations("adminLottery");

  const settings = await getSiteSettings(user.id);
  if (!settings.lotteryEnabled) redirect(`/${locale}/admin/bookings/${id}`);

  const bookingEvent = await prisma.bookingEvent.findFirst({
    where: { id, ownerId: user.id }
  });
  if (!bookingEvent) notFound();
  if (!bookingEvent.lotteryEnabled) redirect(`/${locale}/admin/bookings/${id}`);

  // Guarantees a draw (and its shareable entry-link token) exists as soon as
  // the admin opens this page, even before any prize or entry has been added.
  await ensureLotteryDraw(id);

  const event = await prisma.bookingEvent.findFirst({
    where: { id, ownerId: user.id },
    include: {
      slots: {
        include: {
          bookings: {
            where: { status: "confirmed" },
            include: { lotteryEntry: true }
          }
        }
      },
      lotteryDraw: {
        include: {
          entries: { orderBy: { createdAt: "asc" } },
          prizes: {
            orderBy: { sortOrder: "asc" },
            include: { _count: { select: { winners: true } } }
          }
        }
      }
    }
  });
  if (!event || !event.lotteryDraw) notFound();
  const draw = event.lotteryDraw;

  const availableBookings = event.slots
    .flatMap((s) => s.bookings)
    .filter((b) => !b.lotteryEntry)
    .map((b) => ({
      id: b.id,
      name: b.name,
      subject: b.subject
    }));

  const entries = draw.entries.map((e) => ({
    id: e.id,
    token: e.token,
    name: e.name,
    subject: e.subject,
    wonPrizeId: e.wonPrizeId
  }));

  const prizes = draw.prizes.map((p) => ({
    id: p.id,
    name: p.name,
    quantity: p.quantity,
    weight: p.weight,
    wonCount: p._count.winners
  }));

  const shareUrl = `${config.appBaseUrl()}/${locale}/draw/${draw.token}`;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">
          {t("title")}
          <span className="ml-3 text-base font-normal text-fg-subtle">
            {event.titleZh || event.titleEn}
          </span>
        </h1>
        <Link
          href={`/admin/bookings/${event.id}`}
          className="text-sm text-fg-subtle underline hover:text-fg"
        >
          {t("backToEvent")}
        </Link>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="text-sm font-semibold">{t("shareLink")}</p>
        <div className="mt-2 flex items-center gap-2">
          <code className="break-all rounded-md bg-page px-3 py-2 text-xs text-success">
            {shareUrl}
          </code>
          <CopyButton text={shareUrl} />
        </div>
        <p className="mt-2 text-xs text-fg-subtle">{t("shareLinkHint")}</p>
        <div className="mt-3 flex flex-col gap-2">
          <LotteryOpenToggle
            drawId={draw.id}
            defaultOpen={draw.open}
            openLabel={t("openForEntry")}
          />
          <p className="text-xs text-fg-subtle">{t("openForEntryHint")}</p>
        </div>
      </div>

      <LotteryManager
        bookingEventId={event.id}
        availableBookings={availableBookings}
        entries={entries}
        prizes={prizes}
      />
    </div>
  );
}
