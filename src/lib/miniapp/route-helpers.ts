import type { NextResponse } from "next/server";
import { clientIp } from "@/lib/clientIp";
import { authenticateMiniProgramRequest } from "./auth";
import { apiSuccess, MiniAppApiError } from "./http";
import type { MiniProgramErrorCode } from "./http";

export interface AuthenticatedMiniAppIdentity {
  identityId: string;
  sessionId: string;
  tokenHash: string;
}

export async function requireMiniAppIdentity(
  request: Request
): Promise<AuthenticatedMiniAppIdentity> {
  const identity = await authenticateMiniProgramRequest(request);
  if (!identity) throw new MiniAppApiError(401, "AUTH_REQUIRED");
  return identity;
}

export async function optionalMiniAppIdentity(
  request: Request
): Promise<AuthenticatedMiniAppIdentity | null> {
  if (!request.headers.has("authorization")) return null;
  return requireMiniAppIdentity(request);
}

export function miniAppWriteClientIp(request: Request): string {
  return clientIp(request.headers);
}

type ServiceFailure = {
  ok: false;
  error: string;
};

type ServiceSuccess<T> = {
  ok: true;
  data: T;
};

const SERVICE_ERROR_MAP: Record<
  string,
  { status: number; code: MiniProgramErrorCode }
> = {
  notFound: { status: 404, code: "NOT_FOUND" },
  closed: { status: 409, code: "CLOSED" },
  slotFull: { status: 409, code: "SLOT_FULL" },
  slotUnavailable: { status: 409, code: "SLOT_UNAVAILABLE" },
  duplicate: { status: 409, code: "DUPLICATE" },
  alreadySpun: { status: 409, code: "ALREADY_SPUN" },
  noPrizesLeft: { status: 409, code: "NO_PRIZES_LEFT" },
  notReady: { status: 409, code: "NOT_READY" },
  rateLimited: { status: 429, code: "RATE_LIMITED" },
  conflict: { status: 409, code: "CONFLICT" },
  forbidden: { status: 403, code: "FORBIDDEN" }
};

export function serviceResponse<T>(
  request: Request,
  result: ServiceSuccess<T> | ServiceFailure,
  successStatus = 200
): NextResponse {
  if (result.ok) {
    return apiSuccess(request, result.data, { status: successStatus });
  }
  const mapped = SERVICE_ERROR_MAP[result.error] ?? {
    status: 409,
    code: "CONFLICT"
  };
  throw new MiniAppApiError(mapped.status, mapped.code);
}
