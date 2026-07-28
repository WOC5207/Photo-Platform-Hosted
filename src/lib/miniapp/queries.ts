import "server-only";
import type { Prisma } from "@prisma/client";
import { config } from "@/lib/config";
import { prisma } from "@/lib/db";
import { publicPhotoWhere } from "@/lib/photoVisibility";
import { formatDate } from "@/lib/datetime";
import { wallClockNow } from "@/lib/timeZone";
import {
  absoluteUrl,
  localized,
  publicBaseUrl,
  toPhotoDto,
  toSiteImageUrl,
  toSlotTimeDto
} from "./dto";
import { decodeCursor, encodeCursor } from "./cursor";
import { invalidCursor, MiniAppApiError } from "./http";

const visibleAlbumWhere = {
  published: true,
  photos: { some: publicPhotoWhere }
} satisfies Prisma.EventWhereInput;

function cursorDateId(
  cursor: string | null | undefined,
  kind: string
): { date: Date; id: string } | null {
  if (!cursor) return null;
  const position = decodeCursor(cursor, kind);
  if (
    !position ||
    position.length !== 2 ||
    typeof position[0] !== "string" ||
    typeof position[1] !== "string"
  ) {
    return invalidCursor();
  }
  const date = new Date(position[0]);
  if (Number.isNaN(date.getTime()) || !position[1]) return invalidCursor();
  return { date, id: position[1] };
}

function requireEnabledSettings<T extends { miniappEnabled: boolean } | null>(
  settings: T
): NonNullable<T> {
  if (!settings?.miniappEnabled) {
    throw new MiniAppApiError(404, "NOT_FOUND");
  }
  return settings;
}

export async function listPhotographers(input: {
  requestUrl: string;
  cursor?: string | null;
  limit: number;
}) {
  const cursor = cursorDateId(input.cursor, "photographers");
  const owners = await prisma.user.findMany({
    where: {
      status: "active",
      settings: { miniappEnabled: true },
      events: { some: visibleAlbumWhere },
      ...(cursor
        ? {
            OR: [
              { createdAt: { gt: cursor.date } },
              { createdAt: cursor.date, id: { gt: cursor.id } }
            ]
          }
        : {})
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: input.limit + 1,
    select: {
      id: true,
      username: true,
      displayName: true,
      createdAt: true,
      settings: {
        select: {
          logo: true,
          bookingEnabled: true,
          lotteryEnabled: true,
          announcementsEnabled: true,
          miniappEnabled: true
        }
      },
      events: {
        where: visibleAlbumWhere,
        orderBy: [{ dateStart: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          coverPhoto: {
            where: publicPhotoWhere,
            select: { id: true }
          },
          photos: {
            where: publicPhotoWhere,
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            take: 1,
            select: { id: true }
          },
          _count: {
            select: { photos: { where: publicPhotoWhere } }
          }
        }
      }
    }
  });

  const hasMore = owners.length > input.limit;
  const page = hasMore ? owners.slice(0, input.limit) : owners;
  const baseUrl = publicBaseUrl(input.requestUrl);
  const items = page.map((owner) => {
    const settings = requireEnabledSettings(owner.settings);
    const coverAlbum = owner.events.find(
      (album) => album.coverPhoto || album.photos[0]
    );
    const coverPhotoId =
      coverAlbum?.coverPhoto?.id ?? coverAlbum?.photos[0]?.id ?? null;
    return {
      username: owner.username,
      displayName: owner.displayName || owner.username,
      logoUrl: toSiteImageUrl(settings.logo, baseUrl),
      coverUrl:
        coverAlbum && coverPhotoId
          ? absoluteUrl(
              baseUrl,
              `/api/images/${coverAlbum.id}/${coverPhotoId}-med.webp`
            )
          : "",
      albumCount: owner.events.length,
      photoCount: owner.events.reduce(
        (total, album) => total + album._count.photos,
        0
      ),
      features: {
        booking: settings.bookingEnabled,
        lottery: settings.lotteryEnabled,
        announcements: settings.announcementsEnabled
      }
    };
  });
  const last = page.at(-1);
  return {
    items,
    nextCursor:
      hasMore && last
        ? encodeCursor("photographers", [
            last.createdAt.toISOString(),
            last.id
          ])
        : null
  };
}

export async function getPhotographerProfile(
  username: string,
  requestUrl: string
) {
  const owner = await prisma.user.findFirst({
    where: {
      username,
      status: "active",
      settings: { miniappEnabled: true }
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      settings: true,
      personalLinks: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, labelEn: true, labelZh: true, url: true }
      },
      announcements: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          titleEn: true,
          titleZh: true,
          bodyEn: true,
          bodyZh: true,
          image: true,
          createdAt: true
        }
      }
    }
  });
  if (!owner) throw new MiniAppApiError(404, "NOT_FOUND");
  const settings = requireEnabledSettings(owner.settings);
  const baseUrl = publicBaseUrl(requestUrl);

  const [albumCount, photoCount, creditRows] = await Promise.all([
    prisma.event.count({
      where: { ownerId: owner.id, ...visibleAlbumWhere }
    }),
    prisma.photo.count({
      where: {
        ...publicPhotoWhere,
        event: { ownerId: owner.id, published: true }
      }
    }),
    prisma.photoCredit.findMany({
      where: {
        creditName: { not: "" },
        photo: {
          ...publicPhotoWhere,
          event: { ownerId: owner.id, published: true }
        }
      },
      distinct: ["creditName"],
      select: { creditName: true }
    })
  ]);

  return {
    username: owner.username,
    displayName: owner.displayName || owner.username,
    branding: {
      siteTitle: localized(settings.siteTitleEn, settings.siteTitleZh),
      homeTitle: localized(settings.homeTitleEn, settings.homeTitleZh),
      homeSubtitle: localized(
        settings.homeSubtitleEn,
        settings.homeSubtitleZh
      ),
      logoUrl: toSiteImageUrl(settings.logo, baseUrl),
      backgroundImageUrl: toSiteImageUrl(
        settings.backgroundImage,
        baseUrl
      ),
      backgroundColor: settings.backgroundColor
    },
    vocabulary: {
      credit: localized(settings.creditTermEn, settings.creditTermZh),
      subject: localized(settings.subjectTermEn, settings.subjectTermZh)
    },
    features: {
      booking: settings.bookingEnabled,
      lottery: settings.lotteryEnabled,
      announcements: settings.announcementsEnabled
    },
    stats: {
      albums: albumCount,
      photos: photoCount,
      credits: creditRows.length
    },
    personalLinks: owner.personalLinks.map((link) => ({
      id: link.id,
      label: localized(link.labelEn, link.labelZh),
      url: link.url
    })),
    announcements: settings.announcementsEnabled
      ? owner.announcements.map((announcement) => ({
          id: announcement.id,
          title: localized(announcement.titleEn, announcement.titleZh),
          body: localized(announcement.bodyEn, announcement.bodyZh),
          imageUrl: toSiteImageUrl(announcement.image, baseUrl),
          createdAt: announcement.createdAt.toISOString()
        }))
      : []
  };
}

export async function listPhotographerAlbums(
  username: string,
  input: {
    requestUrl: string;
    cursor?: string | null;
    limit: number;
  }
) {
  const owner = await prisma.user.findFirst({
    where: {
      username,
      status: "active",
      settings: { miniappEnabled: true }
    },
    select: { id: true }
  });
  if (!owner) throw new MiniAppApiError(404, "NOT_FOUND");
  const cursor = cursorDateId(input.cursor, `albums:${username}`);
  const albums = await prisma.event.findMany({
    where: {
      ownerId: owner.id,
      ...visibleAlbumWhere,
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.date } },
              { createdAt: cursor.date, id: { lt: cursor.id } }
            ]
          }
        : {})
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: input.limit + 1,
    select: {
      id: true,
      slug: true,
      titleEn: true,
      titleZh: true,
      descriptionEn: true,
      descriptionZh: true,
      location: true,
      dateStart: true,
      dateEnd: true,
      createdAt: true,
      coverPhoto: {
        where: publicPhotoWhere,
        select: {
          id: true,
          width: true,
          height: true,
          comment: true,
          credits: {
            orderBy: { sortOrder: "asc" },
            select: {
              creditName: true,
              subject: true,
              socialLinks: {
                orderBy: { sortOrder: "asc" },
                select: { platform: true, url: true }
              }
            }
          }
        }
      },
      photos: {
        where: publicPhotoWhere,
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        take: 1,
        select: {
          id: true,
          width: true,
          height: true,
          comment: true,
          credits: {
            orderBy: { sortOrder: "asc" },
            select: {
              creditName: true,
              subject: true,
              socialLinks: {
                orderBy: { sortOrder: "asc" },
                select: { platform: true, url: true }
              }
            }
          }
        }
      },
      _count: { select: { photos: { where: publicPhotoWhere } } }
    }
  });
  const hasMore = albums.length > input.limit;
  const page = hasMore ? albums.slice(0, input.limit) : albums;
  const baseUrl = publicBaseUrl(input.requestUrl);
  const items = page.map((album) => {
    const cover = album.coverPhoto ?? album.photos[0] ?? null;
    return {
      slug: album.slug,
      title: localized(album.titleEn, album.titleZh),
      description: localized(album.descriptionEn, album.descriptionZh),
      location: album.location,
      dateStart: album.dateStart ? formatDate(album.dateStart) : null,
      dateEnd: album.dateEnd ? formatDate(album.dateEnd) : null,
      photoCount: album._count.photos,
      cover: cover ? toPhotoDto(cover, album.id, baseUrl) : null
    };
  });
  const last = page.at(-1);
  return {
    items,
    nextCursor:
      hasMore && last
        ? encodeCursor(`albums:${username}`, [
            last.createdAt.toISOString(),
            last.id
          ])
        : null
  };
}

function photoCursor(
  cursor: string | null | undefined,
  kind: string
): { sortOrder: number; createdAt: Date; id: string } | null {
  if (!cursor) return null;
  const position = decodeCursor(cursor, kind);
  if (
    !position ||
    position.length !== 3 ||
    typeof position[0] !== "number" ||
    !Number.isInteger(position[0]) ||
    typeof position[1] !== "string" ||
    typeof position[2] !== "string"
  ) {
    return invalidCursor();
  }
  const createdAt = new Date(position[1]);
  if (Number.isNaN(createdAt.getTime()) || !position[2]) {
    return invalidCursor();
  }
  return { sortOrder: position[0], createdAt, id: position[2] };
}

const fullPhotoSelect = {
  id: true,
  width: true,
  height: true,
  comment: true,
  sortOrder: true,
  createdAt: true,
  credits: {
    orderBy: { sortOrder: "asc" as const },
    select: {
      creditName: true,
      subject: true,
      socialLinks: {
        orderBy: { sortOrder: "asc" as const },
        select: { platform: true, url: true }
      }
    }
  }
};

export async function listAlbumPhotos(
  username: string,
  slug: string,
  input: {
    requestUrl: string;
    cursor?: string | null;
    limit: number;
  }
) {
  const album = await prisma.event.findFirst({
    where: {
      slug,
      published: true,
      owner: {
        username,
        status: "active",
        settings: { miniappEnabled: true }
      }
    },
    select: {
      id: true,
      slug: true,
      titleEn: true,
      titleZh: true,
      descriptionEn: true,
      descriptionZh: true,
      location: true,
      dateStart: true,
      dateEnd: true
    }
  });
  if (!album) throw new MiniAppApiError(404, "NOT_FOUND");

  const kind = `photos:${username}:${slug}`;
  const cursor = photoCursor(input.cursor, kind);
  const photos = await prisma.photo.findMany({
    where: {
      eventId: album.id,
      ...publicPhotoWhere,
      ...(cursor
        ? {
            OR: [
              { sortOrder: { gt: cursor.sortOrder } },
              {
                sortOrder: cursor.sortOrder,
                createdAt: { gt: cursor.createdAt }
              },
              {
                sortOrder: cursor.sortOrder,
                createdAt: cursor.createdAt,
                id: { gt: cursor.id }
              }
            ]
          }
        : {})
    },
    orderBy: [
      { sortOrder: "asc" },
      { createdAt: "asc" },
      { id: "asc" }
    ],
    take: input.limit + 1,
    select: fullPhotoSelect
  });
  const hasMore = photos.length > input.limit;
  const page = hasMore ? photos.slice(0, input.limit) : photos;
  const baseUrl = publicBaseUrl(input.requestUrl);
  const last = page.at(-1);
  return {
    album: {
      slug: album.slug,
      title: localized(album.titleEn, album.titleZh),
      description: localized(album.descriptionEn, album.descriptionZh),
      location: album.location,
      dateStart: album.dateStart ? formatDate(album.dateStart) : null,
      dateEnd: album.dateEnd ? formatDate(album.dateEnd) : null
    },
    items: page.map((photo) => toPhotoDto(photo, album.id, baseUrl)),
    nextCursor:
      hasMore && last
        ? encodeCursor(kind, [
            last.sortOrder,
            last.createdAt.toISOString(),
            last.id
          ])
        : null
  };
}

export async function searchPhotographerPhotos(
  username: string,
  query: string,
  input: {
    requestUrl: string;
    cursor?: string | null;
    limit: number;
  }
) {
  const owner = await prisma.user.findFirst({
    where: {
      username,
      status: "active",
      settings: { miniappEnabled: true }
    },
    select: { id: true }
  });
  if (!owner) throw new MiniAppApiError(404, "NOT_FOUND");

  const kind = `search:${username}:${query.normalize("NFKC").toLowerCase()}`;
  const cursor = cursorDateId(input.cursor, kind);
  const photos = await prisma.photo.findMany({
    where: {
      ...publicPhotoWhere,
      event: { ownerId: owner.id, published: true },
      OR: [
        { comment: { contains: query, mode: "insensitive" } },
        {
          credits: {
            some: { creditName: { contains: query, mode: "insensitive" } }
          }
        },
        {
          credits: {
            some: { subject: { contains: query, mode: "insensitive" } }
          }
        }
      ],
      ...(cursor
        ? {
            AND: [
              {
                OR: [
                  { createdAt: { lt: cursor.date } },
                  { createdAt: cursor.date, id: { lt: cursor.id } }
                ]
              }
            ]
          }
        : {})
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: input.limit + 1,
    select: {
      ...fullPhotoSelect,
      event: {
        select: {
          id: true,
          slug: true,
          titleEn: true,
          titleZh: true
        }
      }
    }
  });
  const hasMore = photos.length > input.limit;
  const page = hasMore ? photos.slice(0, input.limit) : photos;
  const baseUrl = publicBaseUrl(input.requestUrl);
  const last = page.at(-1);
  return {
    items: page.map((photo) => ({
      album: {
        slug: photo.event.slug,
        title: localized(photo.event.titleEn, photo.event.titleZh)
      },
      photo: toPhotoDto(photo, photo.event.id, baseUrl)
    })),
    nextCursor:
      hasMore && last
        ? encodeCursor(kind, [last.createdAt.toISOString(), last.id])
        : null
  };
}

export async function listPhotographerBookingEvents(
  username: string,
  input: { cursor?: string | null; limit: number }
) {
  const owner = await prisma.user.findFirst({
    where: {
      username,
      status: "active",
      settings: { miniappEnabled: true, bookingEnabled: true }
    },
    select: {
      id: true,
      settings: {
        select: {
          miniappEnabled: true,
          timeZone: true,
          bookingPriceEnabled: true
        }
      }
    }
  });
  if (!owner) throw new MiniAppApiError(404, "NOT_FOUND");
  const settings = requireEnabledSettings(owner.settings);
  const now = wallClockNow(settings.timeZone);
  const cursor = cursorDateId(input.cursor, `booking-events:${username}`);
  const events = await prisma.bookingEvent.findMany({
    where: {
      ownerId: owner.id,
      open: true,
      slots: { some: { startTime: { gt: now } } },
      ...(cursor
        ? {
            OR: [
              { date: { gt: cursor.date } },
              { date: cursor.date, id: { gt: cursor.id } }
            ]
          }
        : {})
    },
    orderBy: [{ date: "asc" }, { id: "asc" }],
    take: input.limit + 1,
    select: {
      id: true,
      token: true,
      titleEn: true,
      titleZh: true,
      descriptionEn: true,
      descriptionZh: true,
      location: true,
      date: true,
      lotteryEnabled: true,
      slots: {
        where: { startTime: { gt: now } },
        select: {
          capacity: true,
          _count: {
            select: { bookings: { where: { status: "confirmed" } } }
          }
        }
      }
    }
  });
  const hasMore = events.length > input.limit;
  const page = hasMore ? events.slice(0, input.limit) : events;
  const last = page.at(-1);
  return {
    items: page.map((event) => ({
      token: event.token,
      title: localized(event.titleEn, event.titleZh),
      description: localized(event.descriptionEn, event.descriptionZh),
      location: event.location,
      firstDate: formatDate(event.date),
      timeZone: settings.timeZone,
      remaining: event.slots.reduce(
        (sum, slot) =>
          sum + Math.max(0, slot.capacity - slot._count.bookings),
        0
      ),
      lotteryEnabled: event.lotteryEnabled
    })),
    nextCursor:
      hasMore && last
        ? encodeCursor(`booking-events:${username}`, [
            last.date.toISOString(),
            last.id
          ])
        : null
  };
}

export async function getBookingEvent(token: string) {
  const event = await prisma.bookingEvent.findUnique({
    where: { token },
    select: {
      token: true,
      titleEn: true,
      titleZh: true,
      descriptionEn: true,
      descriptionZh: true,
      location: true,
      open: true,
      lotteryEnabled: true,
      owner: {
        select: {
          username: true,
          status: true,
          settings: {
            select: {
              miniappEnabled: true,
              bookingEnabled: true,
              bookingPriceEnabled: true,
              timeZone: true
            }
          }
        }
      },
      days: {
        orderBy: { date: "asc" },
        select: {
          id: true,
          date: true,
          slots: {
            orderBy: { startTime: "asc" },
            select: {
              id: true,
              startTime: true,
              endTime: true,
              capacity: true,
              pricePerPerson: true,
              descriptionEn: true,
              descriptionZh: true,
              _count: {
                select: { bookings: { where: { status: "confirmed" } } }
              }
            }
          }
        }
      }
    }
  });
  if (
    !event ||
    event.owner.status !== "active" ||
    !event.owner.settings?.miniappEnabled ||
    !event.owner.settings.bookingEnabled
  ) {
    throw new MiniAppApiError(404, "NOT_FOUND");
  }
  const settings = event.owner.settings;
  const now = wallClockNow(settings.timeZone);
  const days = event.days
    .map((day) => ({
      id: day.id,
      date: formatDate(day.date),
      slots: day.slots
        .filter((slot) => slot.startTime > now)
        .map((slot) => ({
          id: slot.id,
          ...toSlotTimeDto(
            slot.startTime,
            slot.endTime,
            settings.timeZone
          ),
          remaining: Math.max(0, slot.capacity - slot._count.bookings),
          pricePerPerson: settings.bookingPriceEnabled
            ? slot.pricePerPerson
            : "",
          description: localized(
            slot.descriptionEn,
            slot.descriptionZh
          )
        }))
    }))
    .filter((day) => day.slots.length > 0);
  return {
    token: event.token,
    photographerUsername: event.owner.username,
    title: localized(event.titleEn, event.titleZh),
    description: localized(event.descriptionEn, event.descriptionZh),
    location: event.location,
    open: event.open,
    lotteryEnabled: event.lotteryEnabled,
    timeZone: settings.timeZone,
    days
  };
}

export function getBootstrap() {
  return {
    apiVersion: "v1",
    locales: ["zh", "en"] as const,
    defaultLocale: "zh" as const,
    authentication: {
      provider: "wechat" as const,
      sessionTtlDays: config.miniappSessionTtlDays()
    },
    pagination: {
      maxPageSize: 50
    },
    capabilities: {
      booking: true,
      lottery: true,
      contentReports: true,
      accountDeletion: true,
      uploads: false,
      payments: false
    }
  };
}
