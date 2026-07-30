import "server-only";
import type { Prisma } from "@prisma/client";

type BookingPriceAcceptance =
  | {
      ok: true;
      acceptance: {
        bookingPriceEnabled: true;
        bookingPriceNoticeAcceptedVersion?: number;
        bookingPriceNoticeAcceptedLocale?: string;
        bookingPriceNoticeAcceptedAt?: Date;
      };
    }
  | { ok: false };

/**
 * Validate and record a photographer's acceptance against a locked copy of
 * the current platform notice. Callers perform their settings/event write in
 * the same transaction, so an administrator cannot change the notice between
 * acknowledgement and persistence.
 */
export async function acceptBookingPriceNotice(
  tx: Prisma.TransactionClient,
  {
    ownerId,
    acceptedVersion,
    locale
  }: {
    ownerId: string;
    acceptedVersion: number;
    locale: string;
  }
): Promise<BookingPriceAcceptance> {
  const notices = await tx.$queryRaw<
    {
      bookingPriceNoticeTitleEn: string;
      bookingPriceNoticeTitleZh: string;
      bookingPriceNoticeBodyEn: string;
      bookingPriceNoticeBodyZh: string;
      bookingPriceNoticeVersion: number;
    }[]
  >`SELECT
      "bookingPriceNoticeTitleEn",
      "bookingPriceNoticeTitleZh",
      "bookingPriceNoticeBodyEn",
      "bookingPriceNoticeBodyZh",
      "bookingPriceNoticeVersion"
    FROM "PlatformSettings"
    WHERE id = 'platform'
    FOR UPDATE`;
  const notice = notices[0];
  const existing = await tx.siteSettings.findUnique({
    where: { ownerId },
    select: { bookingPriceEnabled: true }
  });

  if (existing?.bookingPriceEnabled) {
    return { ok: true, acceptance: { bookingPriceEnabled: true } };
  }

  if (
    !notice ||
    (!notice.bookingPriceNoticeTitleEn.trim() &&
      !notice.bookingPriceNoticeTitleZh.trim()) ||
    (!notice.bookingPriceNoticeBodyEn.trim() &&
      !notice.bookingPriceNoticeBodyZh.trim()) ||
    acceptedVersion !== notice.bookingPriceNoticeVersion
  ) {
    return { ok: false };
  }

  return {
    ok: true,
    acceptance: {
      bookingPriceEnabled: true,
      bookingPriceNoticeAcceptedVersion: notice.bookingPriceNoticeVersion,
      bookingPriceNoticeAcceptedLocale: locale,
      bookingPriceNoticeAcceptedAt: new Date()
    }
  };
}
