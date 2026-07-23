import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { findOwner } from "@/lib/owner";
import { photoUrls } from "@/lib/images";
import { formatCredits } from "@/lib/content";
import { clientIp } from "@/lib/clientIp";
import { rateLimit } from "@/lib/rate-limit";

const MAX_RESULTS = 8;

export interface CreditSearchResult {
  photoId: string;
  eventSlug: string;
  eventTitleEn: string;
  eventTitleZh: string;
  /** The combined credit line (credited person(s) + subject), or "". */
  credit: string;
  /** The photographer's free-text comment on the photo, or "". */
  comment: string;
  thumbUrl: string;
}

/**
 * Public search over the per-photo info admins enter: the credited
 * person/character (PhotoCredit.creditName/subject) and the free-text comment
 * (Photo.comment) — e.g. a cosplayer looking for their own photos, a visitor
 * looking for a specific character, or anyone searching a note the photographer
 * left. Only matches photos on published events; unpublished events never
 * surface here. Returns one row per photo (deduped across its credits).
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
  if (
    !rateLimit(`credit-search:${owner.id}:${clientIp(req.headers)}`, {
      limit: 120,
      windowMs: 60 * 1000
    })
  ) {
    return NextResponse.json(
      { results: [] },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  // `mode: "insensitive"` is required on Postgres, where `contains` maps to a
  // case-SENSITIVE LIKE. (It was implicitly case-insensitive under SQLite, so
  // dropping this silently degrades the search rather than breaking it.)
  const photos = await prisma.photo.findMany({
    where: {
      pendingBatchId: null,
      event: { ownerId: owner.id, published: true },
      OR: [
        { comment: { contains: q, mode: "insensitive" } },
        {
          credits: {
            some: {
              OR: [
                { creditName: { contains: q, mode: "insensitive" } },
                { subject: { contains: q, mode: "insensitive" } }
              ]
            }
          }
        }
      ]
    },
    take: MAX_RESULTS,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      eventId: true,
      comment: true,
      event: { select: { slug: true, titleEn: true, titleZh: true } },
      credits: {
        orderBy: { sortOrder: "asc" },
        select: { creditName: true, subject: true }
      }
    }
  });

  const results: CreditSearchResult[] = photos.map((p) => ({
    photoId: p.id,
    eventSlug: p.event.slug,
    eventTitleEn: p.event.titleEn,
    eventTitleZh: p.event.titleZh,
    credit: formatCredits(p.credits),
    comment: p.comment,
    thumbUrl: photoUrls(p.eventId, p.id).thumb
  }));

  return NextResponse.json({ results });
}
