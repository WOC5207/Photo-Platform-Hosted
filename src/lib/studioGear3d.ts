import "server-only";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { pickText } from "@/lib/content";
import { formatDate, formatTime } from "@/lib/datetime";
import { equipmentName, equipmentPhotoUrl } from "@/lib/equipment";
import { siteImageUrl } from "@/lib/images";
import { getSiteSettings } from "@/lib/settings";
import { studioAccount } from "@/lib/studio3d";
import type {
  StudioChecklist,
  StudioGear,
  StudioGearCategory,
  StudioGearContact,
  StudioEquipment,
  StudioLabels,
  StudioPreparation,
  StudioSlotSheet
} from "@/components/album3d/studio/types";

/**
 * The 3D Dashboard's reads for equipment and event preparation. As with the
 * rest of the Dashboard, changes go through the classic dashboard's actions.
 */

/** Slots the sheet carries at once, nearest first; the classic page pages through the rest. */
const MAX_SHEET_SLOTS = 300;

const gearInclude = { category: { select: { name: true } } } as const;

type GearRow = {
  id: string;
  name: string;
  brand: string;
  model: string;
  categoryId: string;
  category: { name: string };
  status: StudioGear["status"];
  statusNote: string;
  serialNumber: string;
  notes: string;
  photoToken: string;
  qrToken: string;
};

function gear(item: GearRow): StudioGear {
  return {
    id: item.id,
    name: equipmentName(item),
    brand: item.brand,
    model: item.model,
    categoryId: item.categoryId,
    category: item.category.name,
    status: item.status,
    statusNote: item.statusNote,
    serialNumber: item.serialNumber,
    notes: item.notes,
    photoUrl: equipmentPhotoUrl(item.photoToken),
    qrToken: item.qrToken
  };
}

async function inventory(user: User): Promise<StudioGear[]> {
  const items = await prisma.equipmentItem.findMany({
    where: { ownerId: user.id },
    include: gearInclude,
    orderBy: [{ category: { name: "asc" } }, { sortOrder: "asc" }, { name: "asc" }, { createdAt: "asc" }]
  });
  return items.map(gear);
}

export async function loadStudioCategories(user: User): Promise<StudioGearCategory[]> {
  const categories = await prisma.equipmentCategory.findMany({
    where: { ownerId: user.id },
    orderBy: { name: "asc" },
    include: { _count: { select: { items: true } } }
  });
  return categories.map((c) => ({ id: c.id, name: c.name, count: c._count.items }));
}

export async function loadStudioEquipment(user: User): Promise<StudioEquipment> {
  const [items, categories] = await Promise.all([inventory(user), loadStudioCategories(user)]);
  return { account: studioAccount(user), items, categories };
}

export async function loadStudioGear(user: User, id: string): Promise<StudioGear | null> {
  const item = await prisma.equipmentItem.findFirst({ where: { id, ownerId: user.id }, include: gearInclude });
  return item ? gear(item) : null;
}

export async function loadStudioGearContact(user: User): Promise<StudioGearContact> {
  const settings = await prisma.siteSettings.findUnique({
    where: { ownerId: user.id },
    select: { equipmentContactMethod: true, equipmentContactLabel: true, equipmentContactValue: true }
  });
  return {
    method: settings?.equipmentContactMethod ?? "",
    label: settings?.equipmentContactLabel ?? "",
    value: settings?.equipmentContactValue ?? ""
  };
}

export async function loadStudioLabels(user: User, selected: string[]): Promise<StudioLabels> {
  const [items, settings] = await Promise.all([inventory(user), getSiteSettings(user.id)]);
  const wanted = new Set(selected);
  return {
    items,
    categories: [...new Set(items.map((item) => item.category))],
    logoUrl: siteImageUrl(settings.logo),
    selected: items.filter((item) => wanted.has(item.id)).map((item) => item.id)
  };
}

function shootDate(value: Date | null, locale: string): string {
  if (!value) return "";
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(value);
}

async function ownedEvents(user: User, locale: string) {
  const events = await prisma.bookingEvent.findMany({
    where: { ownerId: user.id },
    orderBy: { date: "desc" },
    select: { id: true, titleEn: true, titleZh: true }
  });
  return events.map((e) => ({ id: e.id, title: pickText(locale, e.titleEn, e.titleZh) }));
}

/** Packing checklists, soonest shoot first, optionally for one booking event. */
export async function loadStudioPreparation(user: User, locale: string, eventId: string | null): Promise<StudioPreparation> {
  const events = await ownedEvents(user, locale);
  const event = eventId && events.some((e) => e.id === eventId) ? eventId : null;
  const checklists = await prisma.equipmentChecklist.findMany({
    where: { ownerId: user.id, ...(event ? { bookingDay: { bookingEventId: event } } : {}) },
    orderBy: [{ shootDate: "asc" }, { createdAt: "desc" }],
    include: {
      bookingDay: { select: { bookingEvent: { select: { titleEn: true, titleZh: true } } } },
      items: { select: { equipmentId: true, eventState: true } }
    }
  });
  return {
    account: studioAccount(user),
    events,
    event,
    checklists: checklists.map((c) => {
      const gearItems = c.items.filter((item) => item.equipmentId !== null);
      const count = (state: string) => gearItems.filter((item) => item.eventState === state).length;
      const owner = c.bookingDay?.bookingEvent;
      return {
        id: c.id,
        name: c.name,
        date: shootDate(c.shootDate, locale),
        notes: c.notes,
        eventTitle: owner ? pickText(locale, owner.titleEn, owner.titleZh) : "",
        items: c.items.length,
        gear: gearItems.length,
        atEvent: count("AT_EVENT"),
        returned: count("RETURNED"),
        broken: count("BROKEN")
      };
    })
  };
}

export async function loadStudioChecklist(user: User, id: string, locale: string): Promise<StudioChecklist | null> {
  const [checklist, all] = await Promise.all([
    prisma.equipmentChecklist.findFirst({
      where: { id, ownerId: user.id },
      include: {
        bookingDay: { select: { bookingEvent: { select: { id: true, ownerId: true, titleEn: true, titleZh: true } } } },
        items: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          include: { equipment: { include: gearInclude } }
        }
      }
    }),
    prisma.equipmentItem.findMany({
      where: { ownerId: user.id },
      orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
      include: gearInclude
    })
  ]);
  if (!checklist) return null;
  const owner = checklist.bookingDay?.bookingEvent;
  if (owner && owner.ownerId !== user.id) return null;
  const listed = new Set(checklist.items.flatMap((item) => (item.equipmentId ? [item.equipmentId] : [])));
  return {
    id: checklist.id,
    name: checklist.name,
    date: shootDate(checklist.shootDate, locale),
    notes: checklist.notes,
    bookingEventId: owner?.id ?? null,
    eventTitle: owner ? pickText(locale, owner.titleEn, owner.titleZh) : "",
    items: checklist.items.map((item) => ({
      id: item.id,
      label: item.equipment ? equipmentName(item.equipment) : item.label,
      equipmentId: item.equipment?.id ?? null,
      categoryId: item.equipment?.categoryId ?? "",
      category: item.equipment?.category.name ?? "",
      state: item.eventState,
      inventoryStatus: item.equipment?.status ?? null
    })),
    available: all
      .filter((item) => !listed.has(item.id))
      .map((item) => ({ id: item.id, name: equipmentName(item), categoryId: item.categoryId, category: item.category.name, status: item.status })),
    inventoryEmpty: all.length === 0
  };
}

/** Slots with confirmed bookings, as the classic "Booked slots" tab lists them. */
export async function loadStudioSlotSheet(user: User, locale: string, eventId: string | null): Promise<StudioSlotSheet> {
  const events = await ownedEvents(user, locale);
  const event = eventId && events.some((e) => e.id === eventId) ? eventId : null;
  const [settings, slots] = await Promise.all([
    getSiteSettings(user.id),
    prisma.timeSlot.findMany({
      where: {
        bookingEvent: { ownerId: user.id },
        ...(event ? { bookingEventId: event } : {}),
        bookings: { some: { status: "confirmed" } }
      },
      orderBy: [{ startTime: "asc" }, { id: "asc" }],
      take: MAX_SHEET_SLOTS + 1,
      include: { bookingEvent: true, bookings: { where: { status: "confirmed" }, orderBy: { createdAt: "asc" } } }
    })
  ]);
  return {
    account: studioAccount(user),
    events,
    event,
    more: slots.length > MAX_SHEET_SLOTS,
    slots: slots.slice(0, MAX_SHEET_SLOTS).map((slot) => ({
      id: slot.id,
      bookingEventId: slot.bookingEventId,
      eventTitle: pickText(locale, slot.bookingEvent.titleEn, slot.bookingEvent.titleZh),
      location: slot.bookingEvent.location,
      dayKey: slot.startTime.toISOString().slice(0, 10),
      day: formatDate(slot.startTime),
      start: formatTime(slot.startTime),
      end: formatTime(slot.endTime),
      finished: slot.finishedAt !== null,
      booked: slot.bookings.length,
      capacity: slot.capacity,
      price: settings.bookingPriceEnabled ? slot.pricePerPerson : "",
      description: pickText(locale, slot.descriptionEn, slot.descriptionZh),
      bookings: slot.bookings.map((b) => ({
        id: b.id,
        name: b.name,
        subject: b.subject,
        contact: [b.contactMethod, b.contactValue].filter(Boolean).join(": "),
        email: b.email,
        notes: b.notes
      }))
    }))
  };
}
