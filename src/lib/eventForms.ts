import "server-only";
import { z } from "zod";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { acceptBookingPriceNotice } from "@/lib/bookingPriceNotice";
import { createEventWorkspace, validEventDates } from "@/lib/eventWorkspace";
import { deleteEventFiles } from "@/lib/images";
import { findOwnedBookingEvent } from "@/lib/ownership";

/**
 * Creating and deleting an event, shared by the classic dashboard's actions
 * and the 3D Dashboard's. Each caller checks the signed-in account first and
 * decides where to go afterwards.
 */

export function parseSelectedDates(raw: FormDataEntryValue | null): string[] | null {
  if (typeof raw !== "string") return null;
  try { return validEventDates(JSON.parse(raw)); } catch { return null; }
}

const bookingEventSchema = z
  .object({
    titleEn: z.string().trim().max(300),
    titleZh: z.string().trim().max(300),
    location: z.string().trim().max(300),
    descriptionEn: z.string().trim().max(5000),
    descriptionZh: z.string().trim().max(5000),
    visitorEditsEnabled: z.boolean(),
    visitorEditCutoffHours: z.coerce.number().int().min(0).max(8760),
    open: z.boolean()
  })
  .refine((d) => d.titleEn.length > 0 || d.titleZh.length > 0);

export function parseBookingEventForm(formData: FormData) {
  return bookingEventSchema.safeParse({
    titleEn: formData.get("titleEn") ?? "",
    titleZh: formData.get("titleZh") ?? "",
    location: formData.get("location") ?? "",
    descriptionEn: formData.get("descriptionEn") ?? "",
    descriptionZh: formData.get("descriptionZh") ?? "",
    visitorEditsEnabled: formData.get("visitorEditsEnabled") === "on",
    visitorEditCutoffHours: formData.get("visitorEditCutoffHours") ?? "",
    open: formData.get("open") === "on"
  });
}

/** A new event: its gallery, booking page and day checklists, from the event form. */
export async function createEventFromForm(
  user: User,
  locale: string,
  formData: FormData
): Promise<{ error: "validation" | "priceNoticeRequired" | "unknown" } | { galleryId: string; bookingId: string }> {
  const parsed = parseBookingEventForm(formData);
  const dates = parseSelectedDates(formData.get("dates"));
  if (!parsed.success || !dates) return { error: "validation" };
  const d = parsed.data;
  const enablePriceDisplay = formData.get("enablePriceDisplay") === "on";
  const acceptedVersion = Number(
    formData.get("bookingPriceNoticeAcceptedVersion")
  );

  const result = await prisma.$transaction(async (tx) => {
    if (enablePriceDisplay) {
      const acceptance = await acceptBookingPriceNotice(tx, {
        ownerId: user.id,
        acceptedVersion,
        locale
      });
      if (!acceptance.ok) return { error: "priceNoticeRequired" as const };
      await tx.siteSettings.upsert({
        where: { ownerId: user.id },
        create: { ownerId: user.id, ...acceptance.acceptance },
        update: acceptance.acceptance
      });
    }

    const galleryId = formData.get("galleryEventId");
    const workspace = await createEventWorkspace(tx, user.id, {
      titleEn: d.titleEn, titleZh: d.titleZh, descriptionEn: d.descriptionEn,
      descriptionZh: d.descriptionZh, location: d.location,
      visitorEditsEnabled: d.visitorEditsEnabled, visitorEditCutoffHours: d.visitorEditCutoffHours
    }, dates, locale, typeof galleryId === "string" && galleryId ? galleryId : undefined);
    return { workspace };
  }).catch(() => ({ error: "unknown" as const }));
  if (!("workspace" in result) || !result.workspace) return { error: result.error ?? "unknown" };
  return result.workspace;
}

/** Deletes one of the owner's events, its photos and their files; false when it isn't theirs. */
export async function deleteOwnedEvent(ownerId: string, id: string): Promise<boolean> {
  return prisma.$transaction(
    async (tx) => {
      // Pending uploads take this event lock before reserving quota and
      // inserting their placeholder. Taking the same lock makes the event
      // either wholly present (including every reservation) or wholly gone;
      // an upload cannot slip between the byte total and the cascade.
      const event = await tx.$queryRaw<{ id: string }[]>`
        SELECT id
          FROM "Event"
         WHERE id = ${id}
           AND "ownerId" = ${ownerId}
         FOR UPDATE
      `;
      if (event.length !== 1) return false;

      // Lock in the same Event -> User order as upload reservation. This also
      // waits for an in-flight image-processing adjustment before summing, and
      // prevents another account upload/reconcile from changing usedBytes
      // until this event's rows and counter deduction commit together.
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${ownerId} FOR UPDATE`;
      const total = await tx.photo.aggregate({
        // Deliberately includes ready, processing, pending and deleting rows:
        // all of them have already reserved the bytes stored on the row.
        where: { eventId: id },
        _sum: { bytes: true }
      });

      // Files first, while the event lock prevents new reservations. Database
      // rows retain the cleanup path if filesystem removal fails; the database
      // cascade and quota adjustment below are then one atomic commit.
      await deleteEventFiles(ownerId, id);

      const freed = total._sum.bytes ?? 0;
      if (freed > 0) {
        await tx.$executeRaw`
          UPDATE "User"
             SET "usedBytes" = GREATEST(0, "usedBytes" - ${BigInt(freed)})
           WHERE id = ${ownerId}
        `;
      }
      await tx.event.delete({ where: { id } });
      return true;
    },
    // Removing a large event directory can take longer than Prisma's default
    // interactive-transaction timeout. Keep the lock bounded but practical.
    { maxWait: 10_000, timeout: 60_000 }
  );
}

/**
 * Deletes one of the owner's booking pages; its days, slots, bookings and
 * prize draw go with it, and its album stays. False when it isn't theirs.
 */
export async function deleteOwnedBookingEvent(user: User, id: string): Promise<boolean> {
  const event = await findOwnedBookingEvent(id, user);
  if (!event) return false;
  await prisma.bookingEvent.delete({ where: { id: event.id } }).catch(() => {});
  return true;
}
