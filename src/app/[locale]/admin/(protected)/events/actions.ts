"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { isAdmin } from "@/lib/auth";
import { deleteEventFiles, deletePhotoFiles } from "@/lib/images";
import { parseCreditsJson, syncCreditProfiles } from "@/lib/photoCredits";
import { parseShutterSpeed } from "@/lib/exif";
import { slugify, uniqueEventSlug } from "@/lib/slug";

export type EventFormState = { error?: "validation" | "unknown"; ok?: boolean };

const eventSchema = z
  .object({
    titleEn: z.string().trim().max(300),
    titleZh: z.string().trim().max(300),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9-]*$/)
      .max(100),
    dateStart: z.string().trim().max(30),
    dateEnd: z.string().trim().max(30),
    location: z.string().trim().max(300),
    descriptionEn: z.string().trim().max(5000),
    descriptionZh: z.string().trim().max(5000),
    published: z.boolean()
  })
  .refine((d) => d.titleEn.length > 0 || d.titleZh.length > 0);

function parseEventForm(formData: FormData) {
  return eventSchema.safeParse({
    titleEn: formData.get("titleEn") ?? "",
    titleZh: formData.get("titleZh") ?? "",
    slug: formData.get("slug") ?? "",
    dateStart: formData.get("dateStart") ?? "",
    dateEnd: formData.get("dateEnd") ?? "",
    location: formData.get("location") ?? "",
    descriptionEn: formData.get("descriptionEn") ?? "",
    descriptionZh: formData.get("descriptionZh") ?? "",
    published: formData.get("published") === "on"
  });
}

async function guard(): Promise<string> {
  const locale = await getLocale();
  if (!(await isAdmin())) redirect(`/${locale}/login`);
  return locale;
}

function toDate(value: string): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return isNaN(d.getTime()) ? null : d;
}

/** Returns null if dateEnd is set but earlier than dateStart. */
function parseDateRange(
  dateStartStr: string,
  dateEndStr: string
): { dateStart: Date | null; dateEnd: Date | null } | null {
  const dateStart = toDate(dateStartStr);
  const dateEnd = toDate(dateEndStr);
  if (dateStart && dateEnd && dateEnd.getTime() < dateStart.getTime()) return null;
  return { dateStart, dateEnd };
}

export async function createEvent(
  _prev: EventFormState,
  formData: FormData
): Promise<EventFormState> {
  const locale = await guard();
  const parsed = parseEventForm(formData);
  if (!parsed.success) return { error: "validation" };
  const d = parsed.data;
  const range = parseDateRange(d.dateStart, d.dateEnd);
  if (!range) return { error: "validation" };

  const slug = await uniqueEventSlug(d.slug || slugify(d.titleEn || d.titleZh));
  const event = await prisma.event.create({
    data: {
      slug,
      titleEn: d.titleEn,
      titleZh: d.titleZh,
      descriptionEn: d.descriptionEn,
      descriptionZh: d.descriptionZh,
      location: d.location,
      dateStart: range.dateStart,
      dateEnd: range.dateEnd,
      published: d.published
    }
  });

  revalidatePath("/", "layout");
  redirect(`/${locale}/admin/events/${event.id}`);
}

export async function updateEvent(
  _prev: EventFormState,
  formData: FormData
): Promise<EventFormState> {
  await guard();
  const id = formData.get("id");
  if (typeof id !== "string") return { error: "unknown" };
  const parsed = parseEventForm(formData);
  if (!parsed.success) return { error: "validation" };
  const d = parsed.data;
  const range = parseDateRange(d.dateStart, d.dateEnd);
  if (!range) return { error: "validation" };

  const existing = await prisma.event.findUnique({ where: { id } });
  if (!existing) return { error: "unknown" };

  const slug = await uniqueEventSlug(
    d.slug || slugify(d.titleEn || d.titleZh),
    id
  );
  await prisma.event.update({
    where: { id },
    data: {
      slug,
      titleEn: d.titleEn,
      titleZh: d.titleZh,
      descriptionEn: d.descriptionEn,
      descriptionZh: d.descriptionZh,
      location: d.location,
      dateStart: range.dateStart,
      dateEnd: range.dateEnd,
      published: d.published
    }
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteEvent(formData: FormData): Promise<void> {
  const locale = await guard();
  const id = formData.get("id");
  if (typeof id !== "string") return;

  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) return;

  await prisma.event.delete({ where: { id } });
  await deleteEventFiles(id);

  revalidatePath("/", "layout");
  redirect(`/${locale}/admin/events`);
}

/**
 * Replaces all of a photo's credits (and each credit's social links) at
 * once, from the JSON-encoded `creditsJson` field the admin UI submits.
 * Nested social links can't be built with a plain createMany (it only
 * inserts flat rows into one table), so each credit is its own create call
 * inside the transaction instead.
 */
export async function updatePhotoCredits(formData: FormData): Promise<void> {
  await guard();
  const photoId = formData.get("photoId");
  if (typeof photoId !== "string") return;

  const credits = parseCreditsJson(formData.get("creditsJson"));

  await prisma.$transaction([
    prisma.photoCredit.deleteMany({ where: { photoId } }),
    ...credits.map((c, i) =>
      prisma.photoCredit.create({
        data: {
          photoId,
          creditName: c.creditName,
          subject: c.subject,
          sortOrder: i,
          socialLinks: {
            create: c.socialLinks.map((s, j) => ({
              platform: s.platform,
              url: s.url,
              sortOrder: j
            }))
          }
        }
      })
    )
  ]);
  await syncCreditProfiles(credits);
  revalidatePath("/", "layout");
}

/**
 * Fills in or corrects a photo's EXIF fields by hand — for photos that had
 * none embedded (screenshots, re-exports) or where the camera got it wrong.
 * Every field is optional; a blank input clears that field back to unknown
 * rather than leaving the old value in place.
 */
export async function updatePhotoExif(formData: FormData): Promise<void> {
  await guard();
  const photoId = formData.get("photoId");
  if (typeof photoId !== "string") return;

  function numberOrNull(name: string): number | null {
    const raw = String(formData.get(name) ?? "").trim();
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  const focalLengthMm = numberOrNull("exifFocalLengthMm");
  const aperture = numberOrNull("exifAperture");
  const iso = numberOrNull("exifIso");
  const exposureTime = parseShutterSpeed(
    String(formData.get("exifExposureTime") ?? "")
  );
  const takenAtRaw = String(formData.get("exifTakenAt") ?? "").trim();
  const takenAt = takenAtRaw ? new Date(`${takenAtRaw}T00:00:00Z`) : null;
  const cameraModel =
    String(formData.get("exifCameraModel") ?? "").trim().slice(0, 200) || null;
  const lensModel =
    String(formData.get("exifLensModel") ?? "").trim().slice(0, 200) || null;

  await prisma.photo
    .update({
      where: { id: photoId },
      data: {
        exifFocalLengthMm: focalLengthMm,
        exifAperture: aperture,
        exifExposureTime: exposureTime,
        exifIso: iso !== null ? Math.round(iso) : null,
        exifTakenAt: takenAt && !isNaN(takenAt.getTime()) ? takenAt : null,
        exifCameraModel: cameraModel,
        exifLensModel: lensModel
      }
    })
    .catch(() => {});
  revalidatePath("/", "layout");
}

export async function deletePhoto(formData: FormData): Promise<void> {
  await guard();
  const photoId = formData.get("photoId");
  if (typeof photoId !== "string") return;

  const photo = await prisma.photo.findUnique({ where: { id: photoId } });
  if (!photo) return;

  await prisma.photo.delete({ where: { id: photoId } });
  await deletePhotoFiles(photo.eventId, photo.id, photo.filename);
  revalidatePath("/", "layout");
}

function bulkPhotoIds(formData: FormData): string[] {
  return formData.getAll("photoIds").filter((v): v is string => typeof v === "string");
}

export async function bulkDeletePhotos(formData: FormData): Promise<void> {
  await guard();
  const photoIds = bulkPhotoIds(formData);
  if (photoIds.length === 0) return;

  const photos = await prisma.photo.findMany({ where: { id: { in: photoIds } } });
  if (photos.length === 0) return;

  await prisma.photo.deleteMany({ where: { id: { in: photoIds } } });
  await Promise.all(
    photos.map((p) => deletePhotoFiles(p.eventId, p.id, p.filename))
  );
  revalidatePath("/", "layout");
}

/**
 * Overwrites every selected photo's credits with a single (creditName,
 * subject) entry — the bulk counterpart to updatePhotoCredits, for tagging a
 * batch of photos of the same person at once instead of one at a time. Reuses
 * that person's remembered social links (CreditProfile) if one exists, same
 * as the per-photo editor does when a known name is typed.
 */
export async function bulkSetPhotoCredit(formData: FormData): Promise<void> {
  await guard();
  const photoIds = bulkPhotoIds(formData);
  const creditName = String(formData.get("creditName") ?? "").trim().slice(0, 200);
  if (photoIds.length === 0 || !creditName) return;
  const subject = String(formData.get("subject") ?? "").trim().slice(0, 200);

  const profile = await prisma.creditProfile.findUnique({
    where: { creditName },
    include: { socialLinks: { orderBy: { sortOrder: "asc" } } }
  });
  const socialLinks = profile?.socialLinks ?? [];

  await prisma.$transaction(
    photoIds.flatMap((photoId) => [
      prisma.photoCredit.deleteMany({ where: { photoId } }),
      prisma.photoCredit.create({
        data: {
          photoId,
          creditName,
          subject,
          sortOrder: 0,
          socialLinks: {
            create: socialLinks.map((s, j) => ({
              platform: s.platform,
              url: s.url,
              sortOrder: j
            }))
          }
        }
      })
    ])
  );
  revalidatePath("/", "layout");
}

export async function setCoverPhoto(formData: FormData): Promise<void> {
  await guard();
  const photoId = formData.get("photoId");
  if (typeof photoId !== "string") return;

  const photo = await prisma.photo.findUnique({ where: { id: photoId } });
  if (!photo) return;

  await prisma.event.update({
    where: { id: photo.eventId },
    data: { coverPhotoId: photo.id }
  });
  revalidatePath("/", "layout");
}

export async function toggleHomeHighlight(formData: FormData): Promise<void> {
  await guard();
  const photoId = formData.get("photoId");
  if (typeof photoId !== "string") return;

  const photo = await prisma.photo.findUnique({ where: { id: photoId } });
  if (!photo) return;

  await prisma.photo.update({
    where: { id: photoId },
    data: { homeHighlight: !photo.homeHighlight }
  });
  revalidatePath("/", "layout");
}

export async function movePhoto(formData: FormData): Promise<void> {
  await guard();
  const photoId = formData.get("photoId");
  const direction = formData.get("direction");
  if (typeof photoId !== "string" || (direction !== "up" && direction !== "down"))
    return;

  const photo = await prisma.photo.findUnique({ where: { id: photoId } });
  if (!photo) return;

  await prisma.$transaction(async (tx) => {
    const photos = await tx.photo.findMany({
      where: { eventId: photo.eventId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true }
    });
    const index = photos.findIndex((p) => p.id === photoId);
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || swapWith < 0 || swapWith >= photos.length) return;

    // Normalize to contiguous order, then swap the two neighbours.
    const order = photos.map((p) => p.id);
    [order[index], order[swapWith]] = [order[swapWith], order[index]];
    for (let i = 0; i < order.length; i++) {
      await tx.photo.update({
        where: { id: order[i] },
        data: { sortOrder: i + 1 }
      });
    }
  });
  revalidatePath("/", "layout");
}
