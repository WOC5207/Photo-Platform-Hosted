"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { clientIp } from "@/lib/clientIp";
import {
  createPublicLotteryEntry,
  recoverPublicLotteryEntry,
  spinPublicLotteryEntry
} from "@/lib/publicLotteryEntryService";
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
  contactValue: z.string().trim().min(1).max(200)
});

const recoverySchema = entrySchema.extend({
  entryToken: z.string().trim().min(5).max(12)
});

export async function submitLotteryEntry(
  _prev: LotteryEntryFormState,
  formData: FormData
): Promise<LotteryEntryFormState> {
  const parsed = entrySchema.safeParse({
    drawToken: formData.get("drawToken") ?? "",
    name: formData.get("name") ?? "",
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

  const result = await createPublicLotteryEntry(d.drawToken, {
    name: d.name,
    contactValue: d.contactValue
  });

  if (!result.ok) return { error: result.error };
  await authorizeLotteryEntry(result.data.id);
  return { ok: true, entry: result.data };
}

export async function recoverLotteryEntry(
  _prev: LotteryEntryFormState,
  formData: FormData
): Promise<LotteryEntryFormState> {
  const parsed = recoverySchema.safeParse({
    drawToken: formData.get("drawToken") ?? "",
    entryToken: formData.get("entryToken") ?? "",
    name: formData.get("name") ?? "",
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

  const result = await recoverPublicLotteryEntry(d.drawToken, {
    entryToken: d.entryToken,
    name: d.name,
    contactValue: d.contactValue
  });
  if (!result.ok) return { error: result.error };
  await authorizeLotteryEntry(result.data.id);
  return {
    ok: true,
    entry: result.data
  };
}

export type PublicSpinResult =
  | { ok: true; winner: { prizeId: string; prizeName: string } }
  | {
      ok: false;
      error: "rateLimited" | "notFound" | "alreadySpun" | "noPrizesLeft";
    };

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

  const authorizedIds = await getAuthorizedLotteryEntryIds();
  if (!authorizedIds.includes(parsed.data.entryId)) {
    return { ok: false, error: "notFound" };
  }
  const result = await spinPublicLotteryEntry(parsed.data.entryId, {
    drawToken: parsed.data.drawToken
  });
  if (result.ok) {
    return {
      ok: true,
      winner: result.data
    };
  }
  return { ok: false, error: result.error };
}
