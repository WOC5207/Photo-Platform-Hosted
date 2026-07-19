import "server-only";
import { getIronSession, type IronSession } from "iron-session";
import { cookies } from "next/headers";
import { config } from "./config";

interface VisitorSessionData {
  lotteryEntryIds?: string[];
}

const MAX_LOTTERY_ENTRIES = 20;

export async function getVisitorSession(): Promise<IronSession<VisitorSessionData>> {
  return getIronSession<VisitorSessionData>(await cookies(), {
    password: config.sessionSecret(),
    cookieName: "visitor-session",
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 90
    }
  });
}

export async function getAuthorizedLotteryEntryIds(): Promise<string[]> {
  const session = await getVisitorSession();
  return Array.isArray(session.lotteryEntryIds)
    ? session.lotteryEntryIds.slice(-MAX_LOTTERY_ENTRIES)
    : [];
}

export async function authorizeLotteryEntry(entryId: string): Promise<void> {
  const session = await getVisitorSession();
  const existing = Array.isArray(session.lotteryEntryIds)
    ? session.lotteryEntryIds.filter((id) => id !== entryId)
    : [];
  session.lotteryEntryIds = [...existing, entryId].slice(-MAX_LOTTERY_ENTRIES);
  await session.save();
}
