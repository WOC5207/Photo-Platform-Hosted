"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUser, requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { discardSiteImage } from "@/lib/siteImages";

export type SiteSettingsSection =
  | "appearance"
  | "homepage"
  | "contact"
  | "features";

export type SiteSettingsState = { error?: "validation"; ok?: boolean };

/** See the note in the events actions: signed in is not the same as owns it. */
async function guard(): Promise<User> {
  return requireUser(await getLocale());
}

/**
 * The update/delete actions below use updateMany/deleteMany with an ownerId in
 * the where clause rather than update/delete by id. Both are deliberate: the
 * ids arrive in the form body, and the *Many variants are the only ones whose
 * where clause can carry the owner predicate, so the check rides inside the
 * write instead of being a separate step that can be skipped. A foreign id
 * simply matches zero rows.
 */

const sectionSchema = z.enum([
  "appearance",
  "homepage",
  "contact",
  "features"
]);

const appearanceSchema = z.object({
  siteTitleEn: z.string().trim().max(120),
  siteTitleZh: z.string().trim().max(120),
  // Empty (theme default) or a #rgb / #rrggbb hex color.
  backgroundColor: z
    .string()
    .trim()
    .regex(/^(#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}))?$/)
});

const homepageSchema = z.object({
  homeTitleEn: z.string().trim().max(200),
  homeTitleZh: z.string().trim().max(200),
  homeSubtitleEn: z.string().trim().max(300),
  homeSubtitleZh: z.string().trim().max(300),
  announcementsEnabled: z.boolean()
});

const contactSchema = z.object({
  contactEnabled: z.boolean(),
  contactTitleEn: z.string().trim().max(120),
  contactTitleZh: z.string().trim().max(120),
  contactUrlEn: z.string().trim().max(500),
  contactUrlZh: z.string().trim().max(500)
});

const featuresSchema = z.object({
  creditTermEn: z.string().trim().max(60),
  creditTermZh: z.string().trim().max(60),
  subjectTermEn: z.string().trim().max(60),
  subjectTermZh: z.string().trim().max(60),
  homeCreditsLabelEn: z.string().trim().max(60),
  homeCreditsLabelZh: z.string().trim().max(60),
  bookingEnabled: z.boolean(),
  lotteryEnabled: z.boolean(),
  creditProfilesEnabled: z.boolean()
});

export async function updateSiteSettings(
  _prev: SiteSettingsState,
  formData: FormData
): Promise<SiteSettingsState> {
  const user = await guard();
  const section = sectionSchema.safeParse(formData.get("section"));
  if (!section.success) return { error: "validation" };

  if (section.data === "appearance") {
    const parsed = appearanceSchema.safeParse({
      siteTitleEn: formData.get("siteTitleEn") ?? "",
      siteTitleZh: formData.get("siteTitleZh") ?? "",
      backgroundColor: formData.get("backgroundColor") ?? ""
    });
    if (!parsed.success) return { error: "validation" };
    await prisma.siteSettings.upsert({
      where: { ownerId: user.id },
      create: { ownerId: user.id, ...parsed.data },
      update: parsed.data
    });
  } else if (section.data === "homepage") {
    const parsed = homepageSchema.safeParse({
      homeTitleEn: formData.get("homeTitleEn") ?? "",
      homeTitleZh: formData.get("homeTitleZh") ?? "",
      homeSubtitleEn: formData.get("homeSubtitleEn") ?? "",
      homeSubtitleZh: formData.get("homeSubtitleZh") ?? "",
      announcementsEnabled: formData.get("announcementsEnabled") === "on"
    });
    if (!parsed.success) return { error: "validation" };
    await prisma.siteSettings.upsert({
      where: { ownerId: user.id },
      create: { ownerId: user.id, ...parsed.data },
      update: parsed.data
    });
  } else if (section.data === "contact") {
    const parsed = contactSchema.safeParse({
      contactEnabled: formData.get("contactEnabled") === "on",
      contactTitleEn: formData.get("contactTitleEn") ?? "",
      contactTitleZh: formData.get("contactTitleZh") ?? "",
      contactUrlEn: formData.get("contactUrlEn") ?? "",
      contactUrlZh: formData.get("contactUrlZh") ?? ""
    });
    if (!parsed.success) return { error: "validation" };
    await prisma.siteSettings.upsert({
      where: { ownerId: user.id },
      create: { ownerId: user.id, ...parsed.data },
      update: parsed.data
    });
  } else {
    const parsed = featuresSchema.safeParse({
      creditTermEn: formData.get("creditTermEn") ?? "",
      creditTermZh: formData.get("creditTermZh") ?? "",
      subjectTermEn: formData.get("subjectTermEn") ?? "",
      subjectTermZh: formData.get("subjectTermZh") ?? "",
      homeCreditsLabelEn: formData.get("homeCreditsLabelEn") ?? "",
      homeCreditsLabelZh: formData.get("homeCreditsLabelZh") ?? "",
      bookingEnabled: formData.get("bookingEnabled") === "on",
      lotteryEnabled: formData.get("lotteryEnabled") === "on",
      creditProfilesEnabled: formData.get("creditProfilesEnabled") === "on"
    });
    if (!parsed.success) return { error: "validation" };
    const data = {
      ...parsed.data,
      // Lottery is a booking-event tool, so it cannot be public while the
      // parent booking feature is off.
      lotteryEnabled: parsed.data.bookingEnabled && parsed.data.lotteryEnabled
    };
    await prisma.siteSettings.upsert({
      where: { ownerId: user.id },
      create: { ownerId: user.id, ...data },
      update: data
    });
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

export type PersonalLinkState = { error?: "validation"; ok?: boolean };

const personalLinkSchema = z.object({
  labelEn: z.string().trim().max(200),
  labelZh: z.string().trim().max(200),
  url: z.string().trim().min(1).max(500)
});

function parsePersonalLinkForm(formData: FormData) {
  return personalLinkSchema.safeParse({
    labelEn: formData.get("labelEn") ?? "",
    labelZh: formData.get("labelZh") ?? "",
    url: formData.get("url") ?? ""
  });
}

export async function addPersonalLink(
  _prev: PersonalLinkState,
  formData: FormData
): Promise<PersonalLinkState> {
  const user = await guard();
  const parsed = parsePersonalLinkForm(formData);
  if (!parsed.success) return { error: "validation" };
  const d = parsed.data;

  const maxOrder = await prisma.personalLink.aggregate({
    where: { ownerId: user.id },
    _max: { sortOrder: true }
  });
  await prisma.personalLink.create({
    data: {
      ownerId: user.id,
      labelEn: d.labelEn,
      labelZh: d.labelZh,
      url: d.url,
      sortOrder: (maxOrder._max.sortOrder ?? 0) + 1
    }
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updatePersonalLink(formData: FormData): Promise<void> {
  const user = await guard();
  const id = formData.get("id");
  if (typeof id !== "string") return;
  const parsed = parsePersonalLinkForm(formData);
  if (!parsed.success) return;
  const d = parsed.data;

  await prisma.personalLink
    .updateMany({
      where: { id, ownerId: user.id },
      data: { labelEn: d.labelEn, labelZh: d.labelZh, url: d.url }
    })
    .catch(() => {});
  revalidatePath("/", "layout");
}

export async function deletePersonalLink(formData: FormData): Promise<void> {
  const user = await guard();
  const id = formData.get("id");
  if (typeof id !== "string") return;
  await prisma.personalLink.deleteMany({ where: { id, ownerId: user.id } }).catch(() => {});
  revalidatePath("/", "layout");
}

export async function movePersonalLink(formData: FormData): Promise<void> {
  const user = await guard();
  const id = formData.get("id");
  const direction = formData.get("direction");
  if (typeof id !== "string" || (direction !== "up" && direction !== "down"))
    return;

  await prisma.$transaction(async (tx) => {
    const links = await tx.personalLink.findMany({
      // Our rows only: an unscoped findMany here renumbered every
      // owner's list whenever anyone moved one of their own.
      where: { ownerId: user.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true }
    });
    const index = links.findIndex((l) => l.id === id);
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || swapWith < 0 || swapWith >= links.length) return;

    const order = links.map((l) => l.id);
    [order[index], order[swapWith]] = [order[swapWith], order[index]];
    for (let i = 0; i < order.length; i++) {
      await tx.personalLink.update({
        where: { id: order[i] },
        data: { sortOrder: i + 1 }
      });
    }
  });
  revalidatePath("/", "layout");
}

export type ContactMethodState = { error?: "validation"; ok?: boolean };

const contactMethodSchema = z
  .object({
    labelEn: z.string().trim().max(60),
    labelZh: z.string().trim().max(60)
  })
  .refine((d) => d.labelEn.length > 0 || d.labelZh.length > 0);

function parseContactMethodForm(formData: FormData) {
  return contactMethodSchema.safeParse({
    labelEn: formData.get("labelEn") ?? "",
    labelZh: formData.get("labelZh") ?? ""
  });
}

export async function addContactMethod(
  _prev: ContactMethodState,
  formData: FormData
): Promise<ContactMethodState> {
  const user = await guard();
  const parsed = parseContactMethodForm(formData);
  if (!parsed.success) return { error: "validation" };
  const d = parsed.data;

  const maxOrder = await prisma.contactMethod.aggregate({
    where: { ownerId: user.id },
    _max: { sortOrder: true }
  });
  await prisma.contactMethod.create({
    data: {
      ownerId: user.id,
      labelEn: d.labelEn,
      labelZh: d.labelZh,
      sortOrder: (maxOrder._max.sortOrder ?? 0) + 1
    }
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateContactMethod(formData: FormData): Promise<void> {
  const user = await guard();
  const id = formData.get("id");
  if (typeof id !== "string") return;
  const parsed = parseContactMethodForm(formData);
  if (!parsed.success) return;
  const d = parsed.data;

  await prisma.contactMethod
    .updateMany({
      where: { id, ownerId: user.id },
      data: { labelEn: d.labelEn, labelZh: d.labelZh }
    })
    .catch(() => {});
  revalidatePath("/", "layout");
}

export async function deleteContactMethod(formData: FormData): Promise<void> {
  const user = await guard();
  const id = formData.get("id");
  if (typeof id !== "string") return;
  await prisma.contactMethod.deleteMany({ where: { id, ownerId: user.id } }).catch(() => {});
  revalidatePath("/", "layout");
}

export async function moveContactMethod(formData: FormData): Promise<void> {
  const user = await guard();
  const id = formData.get("id");
  const direction = formData.get("direction");
  if (typeof id !== "string" || (direction !== "up" && direction !== "down"))
    return;

  await prisma.$transaction(async (tx) => {
    const methods = await tx.contactMethod.findMany({
      // Our rows only: an unscoped findMany here renumbered every
      // owner's list whenever anyone moved one of their own.
      where: { ownerId: user.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true }
    });
    const index = methods.findIndex((m) => m.id === id);
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || swapWith < 0 || swapWith >= methods.length) return;

    const order = methods.map((m) => m.id);
    [order[index], order[swapWith]] = [order[swapWith], order[index]];
    for (let i = 0; i < order.length; i++) {
      await tx.contactMethod.update({
        where: { id: order[i] },
        data: { sortOrder: i + 1 }
      });
    }
  });
  revalidatePath("/", "layout");
}

export type AnnouncementState = { error?: "validation"; ok?: boolean };

const announcementSchema = z
  .object({
    titleEn: z.string().trim().max(120),
    titleZh: z.string().trim().max(120),
    bodyEn: z.string().trim().max(2000),
    bodyZh: z.string().trim().max(2000)
  })
  .refine((d) => d.titleEn.length > 0 || d.titleZh.length > 0);

function parseAnnouncementForm(formData: FormData) {
  return announcementSchema.safeParse({
    titleEn: formData.get("titleEn") ?? "",
    titleZh: formData.get("titleZh") ?? "",
    bodyEn: formData.get("bodyEn") ?? "",
    bodyZh: formData.get("bodyZh") ?? ""
  });
}

export async function addAnnouncement(
  _prev: AnnouncementState,
  formData: FormData
): Promise<AnnouncementState> {
  const user = await guard();
  const parsed = parseAnnouncementForm(formData);
  if (!parsed.success) return { error: "validation" };
  const d = parsed.data;

  const maxOrder = await prisma.announcement.aggregate({
    where: { ownerId: user.id },
    _max: { sortOrder: true }
  });
  await prisma.announcement.create({
    data: {
      ownerId: user.id,
      titleEn: d.titleEn,
      titleZh: d.titleZh,
      bodyEn: d.bodyEn,
      bodyZh: d.bodyZh,
      sortOrder: (maxOrder._max.sortOrder ?? 0) + 1
    }
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateAnnouncement(formData: FormData): Promise<void> {
  const user = await guard();
  const id = formData.get("id");
  if (typeof id !== "string") return;
  const parsed = parseAnnouncementForm(formData);
  if (!parsed.success) return;
  const d = parsed.data;

  await prisma.announcement
    .updateMany({
      where: { id, ownerId: user.id },
      data: { titleEn: d.titleEn, titleZh: d.titleZh, bodyEn: d.bodyEn, bodyZh: d.bodyZh }
    })
    .catch(() => {});
  revalidatePath("/", "layout");
}

export async function deleteAnnouncement(formData: FormData): Promise<void> {
  const user = await guard();
  const id = formData.get("id");
  if (typeof id !== "string") return;

  // Read the image token first: deleting the row is the only reference to it,
  // so afterwards the file would sit on disk with its bytes still counted
  // against the owner's quota and nothing left pointing at them.
  const existing = await prisma.announcement.findFirst({
    where: { id, ownerId: user.id },
    select: { image: true }
  });
  if (!existing) return;

  await prisma.announcement
    .deleteMany({ where: { id, ownerId: user.id } })
    .catch(() => {});
  if (existing.image) await discardSiteImage(user.id, existing.image);

  revalidatePath("/", "layout");
}

export async function moveAnnouncement(formData: FormData): Promise<void> {
  const user = await guard();
  const id = formData.get("id");
  const direction = formData.get("direction");
  if (typeof id !== "string" || (direction !== "up" && direction !== "down"))
    return;

  await prisma.$transaction(async (tx) => {
    const items = await tx.announcement.findMany({
      // Our rows only: an unscoped findMany here renumbered every
      // owner's list whenever anyone moved one of their own.
      where: { ownerId: user.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true }
    });
    const index = items.findIndex((a) => a.id === id);
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || swapWith < 0 || swapWith >= items.length) return;

    const order = items.map((a) => a.id);
    [order[index], order[swapWith]] = [order[swapWith], order[index]];
    for (let i = 0; i < order.length; i++) {
      await tx.announcement.update({
        where: { id: order[i] },
        data: { sortOrder: i + 1 }
      });
    }
  });
  revalidatePath("/", "layout");
}

export async function removeAnnouncementImage(formData: FormData): Promise<void> {
  const user = await guard();
  const id = formData.get("id");
  if (typeof id !== "string") return;

  // Scoped read before the file delete: an unscoped findUnique here would hand
  // us another owner's image token and we would erase their file from disk.
  const existing = await prisma.announcement.findFirst({
    where: { id, ownerId: user.id },
    select: { image: true }
  });
  if (!existing) return;
  // Retires the file, its row and its bytes together — releasing the quota is
  // the part that is easy to forget and impossible to notice.
  if (existing.image) await discardSiteImage(user.id, existing.image);

  await prisma.announcement
    .updateMany({ where: { id, ownerId: user.id }, data: { image: "" } })
    .catch(() => {});
  revalidatePath("/", "layout");
}

const SITE_IMAGE_COLUMN = {
  background: "backgroundImage",
  logo: "logo",
  contactQrEn: "contactQrImageEn",
  contactQrZh: "contactQrImageZh"
} as const;

export async function removeSiteImage(
  kind: "background" | "logo" | "contactQrEn" | "contactQrZh"
): Promise<void> {
  // Not guard(): this one is called from a client component rather than a form
  // action, so it returns quietly instead of redirecting.
  const user = await getCurrentUser();
  if (!user) return;

  const column = SITE_IMAGE_COLUMN[kind];
  const existing = await prisma.siteSettings.findUnique({
    where: { ownerId: user.id },
    select: {
      backgroundImage: true,
      logo: true,
      contactQrImageEn: true,
      contactQrImageZh: true
    }
  });
  const token = existing?.[column];
  if (token) await discardSiteImage(user.id, token);

  const cleared = { [column]: "" };
  await prisma.siteSettings.upsert({
    where: { ownerId: user.id },
    create: { ownerId: user.id, ...cleared },
    update: cleared
  });

  revalidatePath("/", "layout");
  const locale = await getLocale();
  const section =
    kind === "contactQrEn" || kind === "contactQrZh"
      ? "contact"
      : "appearance";
  redirect(`/${locale}/dashboard/settings?section=${section}`);
}
