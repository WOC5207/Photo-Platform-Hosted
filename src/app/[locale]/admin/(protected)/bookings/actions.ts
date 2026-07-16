"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { isAdmin } from "@/lib/auth";
import { parseNaiveDateTime } from "@/lib/datetime";

export type BookingEventFormState = {
  error?: "validation" | "unknown";
  ok?: boolean;
};
export type SlotFormState = { error?: "validation"; ok?: boolean };

async function guard(): Promise<string> {
  const locale = await getLocale();
  if (!(await isAdmin())) redirect(`/${locale}/login`);
  return locale;
}

const bookingEventSchema = z
  .object({
    titleEn: z.string().trim().max(300),
    titleZh: z.string().trim().max(300),
    date: z.string().trim().max(30),
    location: z.string().trim().max(300),
    descriptionEn: z.string().trim().max(5000),
    descriptionZh: z.string().trim().max(5000),
    open: z.boolean()
  })
  .refine((d) => d.titleEn.length > 0 || d.titleZh.length > 0);

function parseBookingEventForm(formData: FormData) {
  return bookingEventSchema.safeParse({
    titleEn: formData.get("titleEn") ?? "",
    titleZh: formData.get("titleZh") ?? "",
    date: formData.get("date") ?? "",
    location: formData.get("location") ?? "",
    descriptionEn: formData.get("descriptionEn") ?? "",
    descriptionZh: formData.get("descriptionZh") ?? "",
    open: formData.get("open") === "on"
  });
}

function toDate(value: string): Date {
  const d = new Date(`${value}T00:00:00Z`);
  return isNaN(d.getTime()) ? new Date() : d;
}

export async function createBookingEvent(
  _prev: BookingEventFormState,
  formData: FormData
): Promise<BookingEventFormState> {
  const locale = await guard();
  const parsed = parseBookingEventForm(formData);
  if (!parsed.success) return { error: "validation" };
  const d = parsed.data;

  const event = await prisma.bookingEvent.create({
    data: {
      token: randomUUID().replace(/-/g, ""),
      titleEn: d.titleEn,
      titleZh: d.titleZh,
      descriptionEn: d.descriptionEn,
      descriptionZh: d.descriptionZh,
      location: d.location,
      date: toDate(d.date),
      open: d.open
    }
  });

  revalidatePath("/", "layout");
  redirect(`/${locale}/admin/bookings/${event.id}`);
}

export async function updateBookingEvent(
  _prev: BookingEventFormState,
  formData: FormData
): Promise<BookingEventFormState> {
  await guard();
  const id = formData.get("id");
  if (typeof id !== "string") return { error: "unknown" };
  const parsed = parseBookingEventForm(formData);
  if (!parsed.success) return { error: "validation" };
  const d = parsed.data;

  try {
    await prisma.bookingEvent.update({
      where: { id },
      data: {
        titleEn: d.titleEn,
        titleZh: d.titleZh,
        descriptionEn: d.descriptionEn,
        descriptionZh: d.descriptionZh,
        location: d.location,
        date: toDate(d.date),
        open: d.open
      }
    });
  } catch {
    return { error: "unknown" };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteBookingEvent(formData: FormData): Promise<void> {
  const locale = await guard();
  const id = formData.get("id");
  if (typeof id !== "string") return;

  await prisma.bookingEvent.delete({ where: { id } }).catch(() => {});
  revalidatePath("/", "layout");
  redirect(`/${locale}/admin/bookings`);
}

const slotsSchema = z.object({
  firstSlotStart: z.string(),
  slotMinutes: z.coerce.number().int().min(5).max(24 * 60),
  slotCount: z.coerce.number().int().min(1).max(100),
  capacity: z.coerce.number().int().min(1).max(1000),
  descriptionEn: z.string().trim().max(120),
  descriptionZh: z.string().trim().max(120)
});

export async function addSlots(
  _prev: SlotFormState,
  formData: FormData
): Promise<SlotFormState> {
  await guard();
  const eventId = formData.get("eventId");
  if (typeof eventId !== "string") return { error: "validation" };

  const parsed = slotsSchema.safeParse({
    firstSlotStart: formData.get("firstSlotStart") ?? "",
    slotMinutes: formData.get("slotMinutes") ?? "",
    slotCount: formData.get("slotCount") ?? "",
    capacity: formData.get("capacity") ?? "",
    descriptionEn: formData.get("descriptionEn") ?? "",
    descriptionZh: formData.get("descriptionZh") ?? ""
  });
  if (!parsed.success) return { error: "validation" };

  const start = parseNaiveDateTime(parsed.data.firstSlotStart);
  if (!start) return { error: "validation" };

  const event = await prisma.bookingEvent.findUnique({
    where: { id: eventId }
  });
  if (!event) return { error: "validation" };

  const { slotMinutes, slotCount, capacity, descriptionEn, descriptionZh } =
    parsed.data;
  const slots = Array.from({ length: slotCount }, (_, i) => {
    const s = new Date(start.getTime() + i * slotMinutes * 60_000);
    const e = new Date(s.getTime() + slotMinutes * 60_000);
    return {
      bookingEventId: eventId,
      startTime: s,
      endTime: e,
      capacity,
      descriptionEn,
      descriptionZh
    };
  });

  await prisma.timeSlot.createMany({ data: slots });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteSlot(formData: FormData): Promise<void> {
  await guard();
  const slotId = formData.get("slotId");
  if (typeof slotId !== "string") return;
  await prisma.timeSlot.delete({ where: { id: slotId } }).catch(() => {});
  revalidatePath("/", "layout");
}

export type BookingStatusState = { error?: "slotFull"; ok?: boolean };

export async function setBookingStatus(
  _prev: BookingStatusState,
  formData: FormData
): Promise<BookingStatusState> {
  await guard();
  const bookingId = formData.get("bookingId");
  const status = formData.get("status");
  if (
    typeof bookingId !== "string" ||
    (status !== "confirmed" && status !== "cancelled")
  )
    return {};

  // Cancelling always frees capacity, so it never conflicts. Restoring must
  // respect the slot's capacity — otherwise the freed spot may have been
  // re-booked, and restoring would overbook (the public booking flow already
  // guards this transactionally; see book/actions.ts:createBooking).
  if (status === "cancelled") {
    await prisma.booking
      .update({ where: { id: bookingId }, data: { status: "cancelled" } })
      .catch(() => {});
    revalidatePath("/", "layout");
    return { ok: true };
  }

  const result: BookingStatusState = await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: { timeSlot: true }
    });
    if (!booking) return {};
    if (booking.status === "confirmed") return { ok: true };

    const confirmed = await tx.booking.count({
      where: { timeSlotId: booking.timeSlotId, status: "confirmed" }
    });
    if (confirmed >= booking.timeSlot.capacity) return { error: "slotFull" };

    await tx.booking.update({
      where: { id: bookingId },
      data: { status: "confirmed" }
    });
    return { ok: true };
  });

  if (result.ok) revalidatePath("/", "layout");
  return result;
}
