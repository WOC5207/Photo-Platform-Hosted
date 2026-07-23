import "server-only";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { slugify, uniqueEventSlug } from "@/lib/slug";

/**
 * Atomically seeds the first-run examples and closes onboarding for one owner.
 *
 * The conditional settings update is both the completion flag and the row
 * lock/gate. Concurrent attempts serialize there: the first transaction
 * creates all seed rows and commits the flag with them; later attempts update
 * zero rows and do nothing. If any seed fails, the transaction rolls back the
 * flag and every seed row together, so a retry starts cleanly.
 */
export async function completeOwnerSetup(ownerId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.siteSettings.updateMany({
      where: { ownerId, setupCompleted: false },
      data: { setupCompleted: true }
    });
    if (claimed.count === 0) return false;

    const settings = await tx.siteSettings.findUniqueOrThrow({
      where: { ownerId },
      select: { bookingEnabled: true }
    });

    const albumSlug = await uniqueEventSlug(
      ownerId,
      slugify("my-first-album") || "my-first-album",
      undefined,
      tx
    );
    await tx.event.create({
      data: {
        ownerId,
        slug: albumSlug,
        titleEn: "My First Album",
        titleZh: "我的第一个相册",
        descriptionEn:
          "A draft album to get you started — add photos, then publish when ready.",
        descriptionZh: "示例相册，帮助你快速上手——添加照片后即可发布。",
        published: false
      }
    });

    if (settings.bookingEnabled) {
      const date = new Date();
      date.setUTCHours(0, 0, 0, 0);
      date.setUTCDate(date.getUTCDate() + 14);
      await tx.bookingEvent.create({
        data: {
          ownerId,
          token: randomUUID().replace(/-/g, ""),
          titleEn: "Sample Photoshoot",
          titleZh: "示例场照活动",
          descriptionEn:
            "A draft booking event to get you started — add time slots, then open it when ready.",
          descriptionZh:
            "示例预约活动，帮助你快速上手——添加时间段后即可开放预约。",
          date,
          open: false,
          days: { create: { date } }
        }
      });
    }

    return true;
  });
}
