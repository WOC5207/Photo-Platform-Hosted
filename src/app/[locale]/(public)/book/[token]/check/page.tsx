import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { pickText } from "@/lib/content";
import { getSiteSettings } from "@/lib/settings";
import CheckBookingForm from "@/components/booking/CheckBookingForm";

export const dynamic = "force-dynamic";

export default async function CheckBookingPage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const locale = await getLocale();
  const t = await getTranslations("booking");

  if (!/^[a-z0-9]+$/.test(token)) notFound();

  const event = await prisma.bookingEvent.findUnique({ where: { token } });
  // Booking-enabled is the event owner's setting, so it can only be checked
  // once the token has told us whose event this is.
  if (event && !(await getSiteSettings(event.ownerId)).bookingEnabled) notFound();
  if (!event) notFound();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 rounded-2xl border border-fg/10 bg-page/85 p-6 sm:p-8">
      <div>
        <h1 className="text-3xl font-bold">{t("checkTitle")}</h1>
        <p className="mt-1 text-lg font-semibold">
          {pickText(locale, event.titleEn, event.titleZh)}
        </p>
        <p className="mt-2 text-fg-muted">{t("checkHint")}</p>
      </div>
      <CheckBookingForm eventToken={token} />
    </div>
  );
}
