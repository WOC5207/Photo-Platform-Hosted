import { config } from "@/lib/config";
import { formatCredits } from "@/lib/content";
import { formatDate, formatTime } from "@/lib/datetime";
import { photoUrls, siteImageUrl } from "@/lib/images";
import { safeExternalHttpUrl } from "@/lib/externalUrl";

export interface LocalizedText {
  en: string;
  zh: string;
}

export function localized(en: string, zh: string): LocalizedText {
  return { en, zh };
}

export function absoluteUrl(baseUrl: string, path: string): string {
  if (!path) return "";
  const base = new URL(baseUrl);
  const allowed =
    base.protocol === "https:" ||
    (process.env.NODE_ENV !== "production" && base.protocol === "http:");
  if (!allowed) {
    throw new Error(
      "Mini-program asset URLs must use HTTPS outside development"
    );
  }
  return new URL(path, `${base.origin}/`).toString();
}

export function publicBaseUrl(requestUrl?: string): string {
  const configured = config.assetBaseUrl().trim();
  if (configured) {
    // Validate eagerly even on a response that happens to contain no images.
    absoluteUrl(configured, "/");
    return configured.replace(/\/+$/, "");
  }
  if (process.env.NODE_ENV !== "production" && requestUrl) {
    return new URL(requestUrl).origin;
  }
  throw new Error("ASSET_BASE_URL is required for miniapp asset URLs");
}

export interface PhotoDto {
  id: string;
  width: number;
  height: number;
  public: true;
  caption: string;
  comment: string;
  urls: {
    thumb: string;
    med: string;
    full: string;
  };
  credits: Array<{
    name: string;
    subject: string;
    socialLinks: Array<{ platform: string; url: string }>;
  }>;
}

interface PhotoDtoSource {
  id: string;
  width: number;
  height: number;
  comment?: string;
  credits?: Array<{
    creditName: string;
    subject: string;
    socialLinks?: Array<{ platform: string; url: string }>;
  }>;
}

export function toPhotoDto(
  photo: PhotoDtoSource,
  eventId: string,
  baseUrl: string
): PhotoDto {
  const credits = photo.credits ?? [];
  const urls = photoUrls(eventId, photo.id);
  return {
    id: photo.id,
    width: photo.width,
    height: photo.height,
    public: true,
    caption: formatCredits(credits),
    comment: photo.comment ?? "",
    urls: {
      thumb: absoluteUrl(baseUrl, urls.thumb),
      med: absoluteUrl(baseUrl, urls.med),
      full: absoluteUrl(baseUrl, urls.full)
    },
    credits: credits.map((credit) => ({
      name: credit.creditName,
      subject: credit.subject,
      socialLinks: (credit.socialLinks ?? [])
        .map((link) => ({
          platform: link.platform,
          url: safeExternalHttpUrl(link.url)
        }))
        .filter((link) => link.url !== "")
    }))
  };
}

export function toSiteImageUrl(token: string, baseUrl: string): string {
  return token ? absoluteUrl(baseUrl, siteImageUrl(token)) : "";
}

export interface SlotTimeDto {
  date: string;
  startTime: string;
  endTime: string;
  timeZone: string;
}

/**
 * Booking DateTimes are deliberately naive wall-clock values. Splitting them
 * into date/time strings prevents a client from accidentally applying the
 * phone's timezone to an ISO instant.
 */
export function toSlotTimeDto(
  startTime: Date,
  endTime: Date,
  timeZone: string
): SlotTimeDto {
  return {
    date: formatDate(startTime),
    startTime: formatTime(startTime),
    endTime: formatTime(endTime),
    timeZone
  };
}

export interface BookingDto {
  id: string;
  status: string;
  name: string;
  subject: string;
  notes: string;
  event: {
    token: string;
    title: LocalizedText;
    location: string;
  };
  slot: SlotTimeDto & {
    id: string;
    pricePerPerson: string;
    description: LocalizedText;
  };
  lottery: {
    entryId: string;
    entryToken: string;
    prizeName: string | null;
  } | null;
  createdAt: string;
}

interface BookingDtoSource {
  id: string;
  status: string;
  name: string;
  subject: string;
  notes: string;
  createdAt: Date;
  lotteryEntry?: {
    id: string;
    token: string;
    wonPrize?: { name: string } | null;
  } | null;
  timeSlot: {
    id: string;
    startTime: Date;
    endTime: Date;
    pricePerPerson: string;
    descriptionEn: string;
    descriptionZh: string;
    bookingEvent: {
      token: string;
      titleEn: string;
      titleZh: string;
      location: string;
      owner: {
        settings?: {
          timeZone: string;
          bookingPriceEnabled: boolean;
        } | null;
      };
    };
  };
}

/** Explicit projection: notably, cancelToken and contact details cannot leak. */
export function toBookingDto(booking: BookingDtoSource): BookingDto {
  const settings = booking.timeSlot.bookingEvent.owner.settings;
  const timeZone = settings?.timeZone ?? "UTC";
  return {
    id: booking.id,
    status: booking.status,
    name: booking.name,
    subject: booking.subject,
    notes: booking.notes,
    event: {
      token: booking.timeSlot.bookingEvent.token,
      title: localized(
        booking.timeSlot.bookingEvent.titleEn,
        booking.timeSlot.bookingEvent.titleZh
      ),
      location: booking.timeSlot.bookingEvent.location
    },
    slot: {
      id: booking.timeSlot.id,
      ...toSlotTimeDto(
        booking.timeSlot.startTime,
        booking.timeSlot.endTime,
        timeZone
      ),
      pricePerPerson: settings?.bookingPriceEnabled
        ? booking.timeSlot.pricePerPerson
        : "",
      description: localized(
        booking.timeSlot.descriptionEn,
        booking.timeSlot.descriptionZh
      )
    },
    lottery: booking.lotteryEntry
      ? {
          entryId: booking.lotteryEntry.id,
          entryToken: booking.lotteryEntry.token,
          prizeName: booking.lotteryEntry.wonPrize?.name ?? null
        }
      : null,
    createdAt: booking.createdAt.toISOString()
  };
}
