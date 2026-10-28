import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { pickText } from "@/lib/content";
import { getSiteSettings } from "@/lib/settings";
import { Link } from "@/i18n/navigation";
import CheckBookingForm from "@/components/booking/CheckBookingForm";
import { ArchiveHeading, ArchivePage } from "@/components/booking/archive";

export const dynamic = "force-dynamic";

export default async function CheckBookingPage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const locale = await getLocale();
  const t = await getTranslations("booking");
  const t3 = await getTranslations("album3d");

  if (!/^[a-z0-9]+$/.test(token)) notFound();

  const event = await prisma.bookingEvent.findUnique({ where: { token } });
  // Booking-enabled is the event owner's setting, so it can only be checked
  // once the token has told us whose event this is.
  if (event && !(await getSiteSettings(event.ownerId)).bookingEnabled) notFound();
  if (!event) notFound();

  const title = pickText(locale, event.titleEn, event.titleZh);

  return (
    <ArchivePage
      aside={
        <div className="flex flex-col gap-5">
          <ArchiveHeading
            crumbs={[
              <Link key="event" href={`/book/${token}`} className="hover:text-fg">
                {title}
              </Link>,
              t3("crumbMyBooking")
            ]}
            title={t("checkTitle")}
            meta={title}
          />
          <p className="text-sm leading-6 text-fg-muted">{t("checkHint")}</p>
        </div>
      }
    >
      <CheckBookingForm eventToken={token} />
    </ArchivePage>
  );
}
