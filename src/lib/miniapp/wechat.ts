import "server-only";
import { config } from "@/lib/config";

const CODE_TO_SESSION_URL =
  "https://api.weixin.qq.com/sns/jscode2session";
const CODE_MAX_LENGTH = 512;
const REQUEST_TIMEOUT_MS = 10_000;

interface CodeToSessionResponse {
  openid?: unknown;
  unionid?: unknown;
  session_key?: unknown;
  errcode?: unknown;
  errmsg?: unknown;
}

export type WeChatCodeExchangeErrorCode =
  | "invalid_code"
  | "provider_unavailable"
  | "invalid_provider_response";

export class WeChatCodeExchangeError extends Error {
  readonly code: WeChatCodeExchangeErrorCode;

  constructor(code: WeChatCodeExchangeErrorCode) {
    super(code);
    this.name = "WeChatCodeExchangeError";
    this.code = code;
  }
}

export interface WeChatCodeIdentity {
  appId: string;
  openId: string;
  unionId: string | null;
}

/**
 * Exchanges a short-lived wx.login code on the server. AppSecret and the
 * provider's session_key are deliberately kept inside this function and are
 * never returned to callers, logged, or persisted.
 */
export async function exchangeWeChatLoginCode(
  code: string
): Promise<WeChatCodeIdentity> {
  const normalizedCode = code.trim();
  if (!normalizedCode || normalizedCode.length > CODE_MAX_LENGTH) {
    throw new WeChatCodeExchangeError("invalid_code");
  }

  const appId = config.wechatMiniappAppId();
  const params = new URLSearchParams({
    appid: appId,
    secret: config.wechatMiniappAppSecret(),
    js_code: normalizedCode,
    grant_type: "authorization_code"
  });

  let response: Response;
  try {
    response = await fetch(`${CODE_TO_SESSION_URL}?${params.toString()}`, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch {
    throw new WeChatCodeExchangeError("provider_unavailable");
  }

  if (!response.ok) {
    throw new WeChatCodeExchangeError("provider_unavailable");
  }

  let body: CodeToSessionResponse;
  try {
    body = (await response.json()) as CodeToSessionResponse;
  } catch {
    throw new WeChatCodeExchangeError("invalid_provider_response");
  }

  if (typeof body.errcode === "number" && body.errcode !== 0) {
    throw new WeChatCodeExchangeError("invalid_code");
  }
  if (typeof body.openid !== "string" || body.openid.length === 0) {
    throw new WeChatCodeExchangeError("invalid_provider_response");
  }

  return {
    appId,
    openId: body.openid,
    unionId:
      typeof body.unionid === "string" && body.unionid.length > 0
        ? body.unionid
        : null
  };
}
