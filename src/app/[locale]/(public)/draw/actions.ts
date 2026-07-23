"use server";

import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { clientIp } from "@/lib/clientIp";
import { pickText } from "@/lib/content";
import { prisma } from "@/lib/db";
import { spinForEntry, uniqueEntryToken } from "@/lib/lottery";
import {
  findAvailablePublicDraw,
  lockAvailablePublicDrawByToken
} from "@/lib/publicLottery";
import { rateLimit } from "@/lib/rate-limit";
import {
  authorizeLotteryEntry,
  getAuthorizedLotteryEntryIds
} from "@/lib/visitorSession";

export interface VisitorLotteryEntry {
  id: string;
  token: string;
  wonPrizeId: string | null;
}

export type LotteryEntryFormState = {
  error?: "validation" | "rateLimited" | "closed" | "duplicate" | "notFound";
  ok?: boolean;
  entry?: VisitorLotteryEntry;
};

const entrySchema = z.object({
  drawToken: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  contactMethodId: z.string().trim().min(1).max(100),
  contactValue: z.string().trim().min(1).max(200)
});

const recoverySchema = entrySchema.extend({
  entryToken: z.string().trim().min(5).max(12)
});

function normalizeIdentity(value: string): string {
  return value.trim().normalize("NFKC").toLocaleLowerCase("en");
}

export async function submitLotteryEntry(
  _prev: LotteryEntryFormState,
  formData: FormData
): Promise<LotteryEntryFormState> {
  const parsed = entrySchema.safeParse({
    drawToken: formData.get("drawToken") ?? "",
    name: formData.get("name") ?? "",
    contactMethodId: formData.get("contactMethodId") ?? "",
    contactValue: formData.get("contactValue") ?? ""
  });
  if (!parsed.success) return { error: "validation" };
  const d = parsed.data;
  const ip = clientIp(await headers());
  if (
    !rateLimit(`lottery-entry:${d.drawToken}:${ip}`, {
      limit: 30,
      windowMs: 60 * 60 * 1000
    })
  ) {
    return { error: "rateLimited" };
  }
  const locale = await getLocale();

  const result = await prisma.$transaction(async (tx) => {
    const draw = await lockAvailablePublicDrawByToken(tx, d.drawToken, true);
    if (!draw) return { error: "closed" } as const;

    const contactMethod = await tx.contactMethod.findFirst({
      where: {
        id: d.contactMethodId,
        ownerId: draw.bookingEvent.ownerId
      },
      select: { id: true, labelEn: true, labelZh: true }
    });
    if (!contactMethod) return { error: "validation" } as const;
    const contactMethodLabel = pickText(
      locale,
      contactMethod.labelEn,
      contactMethod.labelZh
    );
    const legacyLabels = [contactMethod.labelEn, contactMethod.labelZh].filter(
      Boolean
    );
    const normalizedValue = normalizeIdentity(d.contactValue);
    const possibleDuplicates = await tx.lotteryEntry.findMany({
      where: {
        drawId: draw.id,
        bookingId: null,
        OR: [
          { contactMethodId: contactMethod.id },
          {
            contactMethodId: null,
            contactMethod: { in: legacyLabels }
          }
        ]
      },
      select: { contactValue: true }
    });
    if (
      possibleDuplicates.some(
        (entry) => normalizeIdentity(entry.contactValue) === normalizedValue
      )
    ) {
      return { error: "duplicate" } as const;
    }

    const token = await uniqueEntryToken(draw.id, tx);
    const entry = await tx.lotteryEntry.create({
      data: {
        drawId: draw.id,
        name: d.name,
        contactMethodId: contactMethod.id,
        contactMethod: contactMethodLabel,
        contactValue: d.contactValue,
        token
      },
      select: { id: true, token: true, wonPrizeId: true }
    });
    return { entry } as const;
  });

  if ("error" in result) return { error: result.error };
  await authorizeLotteryEntry(result.entry.id);
  return { ok: true, entry: result.entry };
}

export async function recoverLotteryEntry(
  _prev: LotteryEntryFormState,
  formData: FormData
): Promise<LotteryEntryFormState> {
  const parsed = recoverySchema.safeParse({
    drawToken: formData.get("drawToken") ?? "",
    entryToken: formData.get("entryToken") ?? "",
    name: formData.get("name") ?? "",
    contactMethodId: formData.get("contactMethodId") ?? "",
    contactValue: formData.get("contactValue") ?? ""
  });
  if (!parsed.success) return { error: "validation" };
  const d = parsed.data;
  const ip = clientIp(await headers());
  if (
    !rateLimit(`lottery-recover:${d.drawToken}:${ip}`, {
      limit: 15,
      windowMs: 60 * 60 * 1000
    })
  ) {
    return { error: "rateLimited" };
  }

  const draw = await findAvailablePublicDraw(d.drawToken);
  if (!draw) return { error: "notFound" };
  const contactMethod = await prisma.contactMethod.findFirst({
    where: {
      id: d.contactMethodId,
      ownerId: draw.bookingEvent.ownerId
    },
    select: { id: true, labelEn: true, labelZh: true }
  });
  if (!contactMethod) return { error: "notFound" };
  const entry = await prisma.lotteryEntry.findUnique({
    where: {
      drawId_token: { drawId: draw.id, token: d.entryToken.toUpperCase() }
    },
    select: {
      id: true,
      token: true,
      name: true,
      contactMethodId: true,
      contactMethod: true,
      contactValue: true,
      wonPrizeId: true
    }
  });
  const contactMethodMatches = entry?.contactMethodId
    ? entry.contactMethodId === contactMethod.id
    : [contactMethod.labelEn, contactMethod.labelZh].includes(
        entry?.contactMethod ?? ""
      );
  if (
    !entry ||
    normalizeIdentity(entry.name) !== normalizeIdentity(d.name) ||
    !contactMethodMatches ||
    normalizeIdentity(entry.contactValue) !== normalizeIdentity(d.contactValue)
  ) {
    return { error: "notFound" };
  }

  await authorizeLotteryEntry(entry.id);
  return {
    ok: true,
    entry: { id: entry.id, token: entry.token, wonPrizeId: entry.wonPrizeId }
  };
}

export type PublicSpinResult =
  | { ok: true; winner: { prizeId: string; prizeName: string } }
  | {
      ok: false;
      error: "rateLimited" | "notFound" | "alreadySpun" | "noPrizesLeft";
    };

const ERROR_MAP = {
  not_found: "notFound",
  already_spun: "alreadySpun",
  no_prizes_left: "noPrizesLeft"
} as const;

export async function spinMyLotteryEntry(
  drawToken: string,
  entryId: string
): Promise<PublicSpinResult> {
  const parsed = z
    .object({
      drawToken: z.string().trim().min(1).max(100),
      entryId: z.string().trim().min(1).max(100)
    })
    .safeParse({ drawToken, entryId });
  if (!parsed.success) return { ok: false, error: "notFound" };

  const ip = clientIp(await headers());
  if (!rateLimit(`lottery-spin:${ip}`, { limit: 20, windowMs: 60 * 60 * 1000 })) {
    return { ok: false, error: "rateLimited" };
  }

  const draw = await findAvailablePublicDraw(parsed.data.drawToken);
  if (!draw) return { ok: false, error: "notFound" };
  const authorizedIds = await getAuthorizedLotteryEntryIds();
  if (!authorizedIds.includes(parsed.data.entryId)) {
    return { ok: false, error: "notFound" };
  }
  const entry = await prisma.lotteryEntry.findFirst({
    where: { id: parsed.data.entryId, drawId: draw.id },
    select: { id: true }
  });
  if (!entry) return { ok: false, error: "notFound" };

  const result = await spinForEntry(entry.id, draw.id, true);
  if (result.ok) {
    return {
      ok: true,
      winner: { prizeId: result.winner.prizeId, prizeName: result.winner.prizeName }
    };
  }
  return { ok: false, error: ERROR_MAP[result.error] };
}
