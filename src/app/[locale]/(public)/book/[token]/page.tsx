import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { pickText } from "@/lib/content";
import { formatDate } from "@/lib/datetime";
import { getContactMethods, getSiteSettings, resolveSubjectTerm } from "@/lib/settings";
import { Link } from "@/i18n/navigation";
import BookingForm, { type PublicSlot } from "@/components/booking/BookingForm";

export const dynamic = "force-dynamic";

export default async function BookPage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const locale = await getLocale();
  const t = await getTranslations("booking");
  const tc = await getTranslations("common");
  if (!/^[a-z0-9]+$/.test(token)) notFound();

  // The token identifies the event and, through it, the owner — which is why
  // this route needs no owner in its path. Look the event up FIRST: whether
  // booking is on, and the vocabulary shown, are that owner's settings, so
  // they cannot be read before we know whose event this is.
  const event = await prisma.bookingEvent.findUnique({
    where: { token },
    include: {
      slots: {
        orderBy: { startTime: "asc" },
        include: {
          _count: {
            select: { bookings: { where: { status: "confirmed" } } }
          }
        }
      }
    }
  });
  if (!event) notFound();

  const settings = await getSiteSettings(event.ownerId);
  const subjectTerm = resolveSubjectTerm(settings, locale, tc("subjectTerm"));
  if (!settings.bookingEnabled) notFound();

  const slots: PublicSlot[] = event.slots.map((s) => ({
    id: s.id,
    start: s.startTime.toISOString(),
    end: s.endTime.toISOString(),
    remaining: Math.max(0, s.capacity - s._count.bookings),
    description: pickText(locale, s.descriptionEn, s.descriptionZh)
  }));

  const description = pickText(locale, event.descriptionEn, event.descriptionZh);
  const contactMethods = (await getContactMethods(event.ownerId)).map((m) => ({
    id: m.id,
    label: pickText(locale, m.labelEn, m.labelZh)
  }));

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 rounded-2xl border border-fg/10 bg-page/85 p-6 sm:p-8">
      <div>
        <h1 className="text-3xl font-bold">
          {pickText(locale, event.titleEn, event.titleZh)}
        </h1>
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
        <Link
          href={`/book/${token}/check`}
          className="mt-4 inline-block rounded-full border border-border-strong px-5 py-2 text-sm font-semibold text-fg-muted transition hover:border-fg-faint hover:text-fg"
        >
          {t("checkBookingButton")}
        </Link>
      </div>

      {!event.open ? (
        <p className="rounded-xl border border-border bg-surface p-6 text-center text-fg-subtle">
          {t("closedNotice")}
        </p>
      ) : slots.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-6 text-center text-fg-subtle">
          {t("noSlotsNotice")}
        </p>
      ) : (
        <BookingForm slots={slots} contactMethods={contactMethods} subjectTerm={subjectTerm} />
      )}
    </div>
  );
}
