import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { findOwner } from "@/lib/owner";
import { photoUrls } from "@/lib/images";

const MAX_RESULTS = 8;

export interface CreditSearchResult {
  photoId: string;
  eventSlug: string;
  eventTitleEn: string;
  eventTitleZh: string;
  creditName: string;
  subject: string;
  thumbUrl: string;
}

/**
 * Public search over the credited-person/character info admins enter per
 * photo (PhotoCredit.creditName/subject) — e.g. a cosplayer looking for
 * their own photos, or a visitor looking for a specific character. Only
 * matches photos on published events; unpublished events' credits never
 * surface here.
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  if (q.length === 0) {
    return NextResponse.json({ results: [] });
  }

  // Whose site is being searched. API routes are not locale- or owner-prefixed,
  // so unlike a page this has no path to infer it from and the caller must say.
  // Without it the search spans every photographer's photos at once, and one
  // site's search box surfaces another's people and links into their albums.
  const username = (req.nextUrl.searchParams.get("owner") ?? "").trim();
  const owner = username ? await findOwner(username) : null;
  if (!owner) return NextResponse.json({ results: [] });

  // `mode: "insensitive"` is required on Postgres, where `contains` maps to a
  // case-SENSITIVE LIKE. (It was implicitly case-insensitive under SQLite, so
  // dropping this silently degrades the search rather than breaking it.)
  const credits = await prisma.photoCredit.findMany({
    where: {
      OR: [
        { creditName: { contains: q, mode: "insensitive" } },
        { subject: { contains: q, mode: "insensitive" } }
      ],
      photo: { event: { ownerId: owner.id, published: true } }
    },
    take: MAX_RESULTS,
    orderBy: { photo: { createdAt: "desc" } },
    include: {
      photo: {
        select: {
          id: true,
          eventId: true,
          event: { select: { slug: true, titleEn: true, titleZh: true } }
        }
      }
    }
  });

  const results: CreditSearchResult[] = credits.map((c) => ({
    photoId: c.photo.id,
    eventSlug: c.photo.event.slug,
    eventTitleEn: c.photo.event.titleEn,
    eventTitleZh: c.photo.event.titleZh,
    creditName: c.creditName,
    subject: c.subject,
    thumbUrl: photoUrls(c.photo.eventId, c.photo.id).thumb
  }));

  return NextResponse.json({ results });
}
