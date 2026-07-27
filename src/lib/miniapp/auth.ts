import "server-only";
import { createHash, randomBytes } from "crypto";
import { config } from "@/lib/config";
import { prisma } from "@/lib/db";
import {
  exchangeWeChatLoginCode,
  WeChatCodeExchangeError
} from "./wechat";

const MAX_ACTIVE_SESSIONS = 5;
const TOKEN_BYTES = 32;
const BEARER_PREFIX = "Bearer ";

export interface MiniProgramPrincipal {
  identityId: string;
  sessionId: string;
  tokenHash: string;
}

export interface CreatedWeChatSession {
  token: string;
  expiresAt: Date;
  identityId: string;
}

export type MiniProgramAuthErrorCode =
  | "disabled"
  | "invalid_code"
  | "provider_unavailable";

export class MiniProgramAuthError extends Error {
  readonly code: MiniProgramAuthErrorCode;

  constructor(code: MiniProgramAuthErrorCode) {
    super(code);
    this.name = "MiniProgramAuthError";
    this.code = code;
  }
}

export function hashMiniProgramToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith(BEARER_PREFIX)) return null;
  const token = header.slice(BEARER_PREFIX.length).trim();
  // A 256-bit base64url token is 43 characters. Keeping the parser strict also
  // prevents arbitrary attacker-controlled strings from becoming DB probes.
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

/**
 * Resolves an opaque mini-program Bearer token. Only the SHA-256 digest reaches
 * PostgreSQL; neither the raw token nor the WeChat OpenID leaves this module.
 */
export async function authenticateMiniProgramRequest(
  request: Request
): Promise<MiniProgramPrincipal | null> {
  if (!config.miniappApiEnabled()) return null;
  const token = bearerToken(request);
  if (!token) return null;

  const tokenHash = hashMiniProgramToken(token);
  const session = await prisma.miniProgramSession.findFirst({
    where: {
      tokenHash,
      revokedAt: null,
      expiresAt: { gt: new Date() }
    },
    select: { id: true, identityId: true }
  });
  if (!session) return null;

  return {
    identityId: session.identityId,
    sessionId: session.id,
    tokenHash
  };
}

/**
 * Exchanges a wx.login code and issues a seven-day (configurable) first-party
 * token. Creation is serialized on the identity row so concurrent logins still
 * leave no more than five active sessions.
 */
export async function createWeChatSession(
  code: string
): Promise<CreatedWeChatSession> {
  if (!config.miniappApiEnabled()) {
    throw new MiniProgramAuthError("disabled");
  }

  let providerIdentity;
  try {
    providerIdentity = await exchangeWeChatLoginCode(code);
  } catch (error) {
    if (error instanceof WeChatCodeExchangeError) {
      throw new MiniProgramAuthError(
        error.code === "provider_unavailable"
          ? "provider_unavailable"
          : "invalid_code"
      );
    }
    throw error;
  }

  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const tokenHash = hashMiniProgramToken(token);
  const expiresAt = new Date(
    Date.now() + config.miniappSessionTtlDays() * 24 * 60 * 60 * 1000
  );

  const identityId = await prisma.$transaction(async (tx) => {
    const identity = await tx.weChatIdentity.upsert({
      where: {
        appId_openId: {
          appId: providerIdentity.appId,
          openId: providerIdentity.openId
        }
      },
      create: {
        appId: providerIdentity.appId,
        openId: providerIdentity.openId,
        unionId: providerIdentity.unionId
      },
      update: providerIdentity.unionId
        ? { unionId: providerIdentity.unionId }
        : {}
    });

    await tx.$queryRaw`
      SELECT id FROM "WeChatIdentity" WHERE id = ${identity.id} FOR UPDATE
    `;

    await tx.miniProgramSession.create({
      data: { identityId: identity.id, tokenHash, expiresAt }
    });

    const excess = await tx.miniProgramSession.findMany({
      where: { identityId: identity.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: MAX_ACTIVE_SESSIONS,
      select: { id: true }
    });
    if (excess.length > 0) {
      await tx.miniProgramSession.deleteMany({
        where: { id: { in: excess.map((session) => session.id) } }
      });
    }

    return identity.id;
  });

  return { token, expiresAt, identityId };
}

export async function revokeMiniProgramSession(
  sessionId: string
): Promise<void> {
  await prisma.miniProgramSession.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() }
  });
}

export async function revokeAllMiniProgramSessions(
  identityId: string
): Promise<void> {
  await prisma.miniProgramSession.updateMany({
    where: { identityId, revokedAt: null },
    data: { revokedAt: new Date() }
  });
}
