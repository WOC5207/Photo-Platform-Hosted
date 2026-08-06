"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  filterOwnedPhotoIds,
  filterOwnedPhotoIdsForDeletion,
  findOwnedEvent,
  findOwnedPhoto,
  findOwnedPhotoForDeletion
} from "@/lib/ownership";
import { moderationAllowsPublicPhoto } from "@/lib/photoVisibility";
import { deleteEventFiles, deletePhotoFiles } from "@/lib/images";
import { deleteOwnedPhotoRowsAndRelease } from "@/lib/quota";
import { parseCreditsJson, syncCreditProfiles } from "@/lib/photoCredits";
import { parseShutterSpeed } from "@/lib/exif";
import { slugify, uniqueEventSlug } from "@/lib/slug";
import { redirect } from "next/navigation";

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

/**
 * Every action below edits "my site", so the guard yields the signed-in user
 * and each action scopes its writes to user.id. Being signed in is not enough:
 * the ids these actions act on come from the form body, so an authenticated
 * user could otherwise name someone else's album or photo and have it obeyed.
 */
async function guard(): Promise<{ locale: string; user: User }> {
  const locale = await getLocale();
  const user = await requireUser(locale);
  return { locale, user };
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
  const { locale, user } = await guard();
  const parsed = parseEventForm(formData);
  if (!parsed.success) return { error: "validation" };
  const d = parsed.data;
  const range = parseDateRange(d.dateStart, d.dateEnd);
  if (!range) return { error: "validation" };

  const slug = await uniqueEventSlug(
    user.id,
    d.slug || slugify(d.titleEn || d.titleZh)
  );
  const event = await prisma.event.create({
    data: {
      ownerId: user.id,
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
  redirect(`/${locale}/dashboard/events/${event.id}`);
}

export async function updateEvent(
  _prev: EventFormState,
  formData: FormData
): Promise<EventFormState> {
  const { user } = await guard();
  const id = formData.get("id");
  if (typeof id !== "string") return { error: "unknown" };
  const parsed = parseEventForm(formData);
  if (!parsed.success) return { error: "validation" };
  const d = parsed.data;
  const range = parseDateRange(d.dateStart, d.dateEnd);
  if (!range) return { error: "validation" };

  const existing = await findOwnedEvent(id, user);
  if (!existing) return { error: "unknown" };

  const slug = await uniqueEventSlug(
    user.id,
    d.slug || slugify(d.titleEn || d.titleZh),
    id
  );
  await prisma.event.update({
    where: { id: existing.id },
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
  const { locale, user } = await guard();
  const id = formData.get("id");
  if (typeof id !== "string") return;

  const deleted = await prisma.$transaction(
    async (tx) => {
      // Pending uploads take this event lock before reserving quota and
      // inserting their placeholder. Taking the same lock makes the event
      // either wholly present (including every reservation) or wholly gone;
      // an upload cannot slip between the byte total and the cascade.
      const event = await tx.$queryRaw<{ id: string }[]>`
        SELECT id
          FROM "Event"
         WHERE id = ${id}
           AND "ownerId" = ${user.id}
         FOR UPDATE
      `;
      if (event.length !== 1) return false;

      // Lock in the same Event -> User order as upload reservation. This also
      // waits for an in-flight image-processing adjustment before summing, and
      // prevents another account upload/reconcile from changing usedBytes
      // until this event's rows and counter deduction commit together.
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
      const total = await tx.photo.aggregate({
        // Deliberately includes ready, processing, pending and deleting rows:
        // all of them have already reserved the bytes stored on the row.
        where: { eventId: id },
        _sum: { bytes: true }
      });

      // Files first, while the event lock prevents new reservations. Database
      // rows retain the cleanup path if filesystem removal fails; the database
      // cascade and quota adjustment below are then one atomic commit.
      await deleteEventFiles(user.id, id);

      const freed = total._sum.bytes ?? 0;
      if (freed > 0) {
        await tx.$executeRaw`
          UPDATE "User"
             SET "usedBytes" = GREATEST(0, "usedBytes" - ${BigInt(freed)})
           WHERE id = ${user.id}
        `;
      }
      await tx.event.delete({ where: { id } });
      return true;
    },
    // Removing a large event directory can take longer than Prisma's default
    // interactive-transaction timeout. Keep the lock bounded but practical.
    { maxWait: 10_000, timeout: 60_000 }
  );
  if (!deleted) return;

  revalidatePath("/", "layout");
  redirect(`/${locale}/dashboard/events`);
}

/**
 * Replaces all of a photo's credits (and each credit's social links) at
 * once, from the JSON-encoded `creditsJson` field the admin UI submits.
 * Nested social links can't be built with a plain createMany (it only
 * inserts flat rows into one table), so each credit is its own create call
 * inside the transaction instead.
 */
export async function updatePhotoCredits(formData: FormData): Promise<void> {
  const { user } = await guard();
  const photoId = formData.get("photoId");
  if (typeof photoId !== "string") return;
  // Verify the photo is ours before touching it: this action previously did no
  // lookup at all and deleted straight from the submitted id.
  if (!(await findOwnedPhoto(photoId, user))) return;

  const credits = parseCreditsJson(formData.get("creditsJson"));
  const comment = String(formData.get("comment") ?? "").trim().slice(0, 2000);

  await prisma.$transaction([
    prisma.photo.update({ where: { id: photoId }, data: { comment } }),
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
  await syncCreditProfiles(user.id, credits);
  revalidatePath("/", "layout");
}

/**
 * Fills in or corrects a photo's EXIF fields by hand — for photos that had
 * none embedded (screenshots, re-exports) or where the camera got it wrong.
 * Every field is optional; a blank input clears that field back to unknown
 * rather than leaving the old value in place.
 */
export type PhotoExifFormState = { status?: "saved" | "error" };

export async function updatePhotoExif(
  _prev: PhotoExifFormState,
  formData: FormData
): Promise<PhotoExifFormState> {
  const { user } = await guard();
  const photoId = formData.get("photoId");
  if (typeof photoId !== "string") return { status: "error" };
  if (!(await findOwnedPhoto(photoId, user))) return { status: "error" };

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

  try {
    await prisma.photo.update({
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
    });
  } catch {
    return { status: "error" };
  }
  revalidatePath("/", "layout");
  return { status: "saved" };
}

export async function deletePhoto(formData: FormData): Promise<void> {
  const { user } = await guard();
  const photoId = formData.get("photoId");
  if (typeof photoId !== "string") return;

  const photo = await findOwnedPhotoForDeletion(photoId, user);
  if (!photo) return;

  await deletePhotoFiles(user.id, photo.eventId, photo.id, photo.filename);
  await deleteOwnedPhotoRowsAndRelease(user.id, [photo.id]);
  revalidatePath("/", "layout");
}

function bulkPhotoIds(formData: FormData): string[] {
  return formData.getAll("photoIds").filter((v): v is string => typeof v === "string");
}

export async function bulkDeletePhotos(formData: FormData): Promise<void> {
  const { user } = await guard();
  // Narrow the client-supplied list to what we actually own BEFORE reading or
  // deleting anything. The unscoped version of this deleted rows and their
  // files straight from the posted ids, so one crafted request wiped another
  // photographer's album off the disk.
  const photoIds = await filterOwnedPhotoIdsForDeletion(
    bulkPhotoIds(formData),
    user
  );
  if (photoIds.length === 0) return;

  const photos = await prisma.photo.findMany({ where: { id: { in: photoIds } } });
  if (photos.length === 0) return;

  await Promise.all(
    photos.map((p) => deletePhotoFiles(user.id, p.eventId, p.id, p.filename))
  );
  await deleteOwnedPhotoRowsAndRelease(user.id, photoIds);
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
  const { user } = await guard();
  const photoIds = await filterOwnedPhotoIds(bulkPhotoIds(formData), user);
  const creditName = String(formData.get("creditName") ?? "").trim().slice(0, 200);
  if (photoIds.length === 0 || !creditName) return;
  const subject = String(formData.get("subject") ?? "").trim().slice(0, 200);

  // Our own remembered links for this name, not someone else's: credit
  // profiles are a private address book, unique per owner.
  const profile = await prisma.creditProfile.findUnique({
    where: { ownerId_creditName: { ownerId: user.id, creditName } },
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
  const { user } = await guard();
  const photoId = formData.get("photoId");
  if (typeof photoId !== "string") return;

  const photo = await findOwnedPhoto(photoId, user);
  if (!photo || !moderationAllowsPublicPhoto(photo.moderationStatus)) return;

  await prisma.event.update({
    where: { id: photo.eventId },
    data: { coverPhotoId: photo.id }
  });
  revalidatePath("/", "layout");
}

export async function toggleHomeHighlight(formData: FormData): Promise<void> {
  const { user } = await guard();
  const photoId = formData.get("photoId");
  if (typeof photoId !== "string") return;

  const photo = await findOwnedPhoto(photoId, user);
  if (!photo || !moderationAllowsPublicPhoto(photo.moderationStatus)) return;

  await prisma.photo.update({
    where: { id: photo.id },
    data: { homeHighlight: !photo.homeHighlight }
  });
  revalidatePath("/", "layout");
}

const homeWeightSchema = z.coerce.number().int().min(1).max(5);

export type HomeWeightFormState =
  | { status: "idle" }
  | { status: "saved"; weight: number }
  | { status: "error" };

export async function updateHomeWeight(
  _previousState: HomeWeightFormState,
  formData: FormData
): Promise<HomeWeightFormState> {
  const { user } = await guard();
  const photoId = formData.get("photoId");
  const parsedWeight = homeWeightSchema.safeParse(formData.get("homeWeight"));
  if (typeof photoId !== "string" || !parsedWeight.success) {
    return { status: "error" };
  }

  const photo = await findOwnedPhoto(photoId, user);
  if (!photo) return { status: "error" };

  await prisma.photo.update({
    where: { id: photo.id },
    data: { homeWeight: parsedWeight.data }
  });
  revalidatePath("/", "layout");
  return { status: "saved", weight: parsedWeight.data };
}

export async function movePhoto(formData: FormData): Promise<void> {
  const { user } = await guard();
  const photoId = formData.get("photoId");
  const direction = formData.get("direction");
  if (typeof photoId !== "string" || (direction !== "up" && direction !== "down"))
    return;

  const photo = await findOwnedPhoto(photoId, user);
  if (!photo) return;

  await prisma.$transaction(async (tx) => {
    const photos = await tx.photo.findMany({
      where: { eventId: photo.eventId, pendingBatchId: null },
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
