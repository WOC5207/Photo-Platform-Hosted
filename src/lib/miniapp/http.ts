import "server-only";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { config } from "@/lib/config";

export type MiniProgramErrorCode =
  | "API_DISABLED"
  | "INVALID_JSON"
  | "VALIDATION_ERROR"
  | "INVALID_CURSOR"
  | "AUTH_REQUIRED"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "CLOSED"
  | "SLOT_FULL"
  | "SLOT_UNAVAILABLE"
  | "DUPLICATE"
  | "ALREADY_SPUN"
  | "NO_PRIZES_LEFT"
  | "NOT_READY"
  | "RATE_LIMITED"
  | "CONFLICT"
  | "WECHAT_LOGIN_FAILED"
  | "WECHAT_PROVIDER_UNAVAILABLE"
  | "INTERNAL_ERROR";

export type ErrorFields = Record<string, string[]>;

export interface MiniProgramErrorBody {
  error: {
    code: MiniProgramErrorCode;
    fields?: ErrorFields;
  };
  requestId: string;
}

export interface MiniProgramSuccessBody<T, M = never> {
  data: T;
  meta?: M;
  requestId: string;
}

const generatedRequestIds = new WeakMap<Request, string>();

export function createMiniProgramRequestId(): string {
  return randomUUID();
}

export function requestId(request: Request): string {
  const supplied = request.headers.get("x-request-id");
  if (supplied && /^[A-Za-z0-9._:-]{1,100}$/.test(supplied)) {
    return supplied;
  }
  const existing = generatedRequestIds.get(request);
  if (existing) return existing;
  const generated = createMiniProgramRequestId();
  generatedRequestIds.set(request, generated);
  return generated;
}

export function miniProgramSuccess<T, M = never>(
  data: T,
  options: {
    requestId?: string;
    meta?: M;
    status?: number;
    headers?: HeadersInit;
  } = {}
): NextResponse {
  const id = options.requestId ?? createMiniProgramRequestId();
  const body: MiniProgramSuccessBody<T, M> = {
    data,
    ...(options.meta === undefined ? {} : { meta: options.meta }),
    requestId: id
  };
  return NextResponse.json(body, {
    status: options.status ?? 200,
    headers: {
      "cache-control": "no-store",
      "x-request-id": id,
      ...Object.fromEntries(new Headers(options.headers).entries())
    }
  });
}

export function miniProgramError(
  code: MiniProgramErrorCode,
  status: number,
  options: {
    requestId?: string;
    fields?: ErrorFields;
    headers?: HeadersInit;
  } = {}
): NextResponse {
  const id = options.requestId ?? createMiniProgramRequestId();
  const body: MiniProgramErrorBody = {
    error: {
      code,
      ...(options.fields === undefined ? {} : { fields: options.fields })
    },
    requestId: id
  };
  return NextResponse.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-request-id": id,
      ...Object.fromEntries(new Headers(options.headers).entries())
    }
  });
}

export class MiniAppApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: MiniProgramErrorCode,
    public readonly fields?: ErrorFields
  ) {
    super(code);
    this.name = "MiniAppApiError";
  }
}

export function apiSuccess<T>(
  request: Request,
  data: T,
  options: {
    status?: number;
    meta?: Record<string, unknown>;
  } = {}
): NextResponse {
  return miniProgramSuccess(data, {
    requestId: requestId(request),
    status: options.status,
    meta: options.meta
  });
}

export function apiError(
  request: Request,
  status: number,
  code: MiniProgramErrorCode,
  fields?: ErrorFields
): NextResponse {
  return miniProgramError(code, status, {
    requestId: requestId(request),
    fields
  });
}

function zodFields(error: z.ZodError): ErrorFields {
  const fields: ErrorFields = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "_";
    (fields[key] ??= []).push(issue.message);
  }
  return fields;
}

export async function parseJson<T>(
  request: Request,
  schema: z.ZodType<T>
): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new MiniAppApiError(400, "INVALID_JSON");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new MiniAppApiError(
      422,
      "VALIDATION_ERROR",
      zodFields(parsed.error)
    );
  }
  return parsed.data;
}

function miniProgramAuthFailure(
  error: unknown
): { status: number; code: MiniProgramErrorCode } | null {
  if (
    !(error instanceof Error) ||
    error.name !== "MiniProgramAuthError" ||
    !("code" in error)
  ) {
    return null;
  }
  switch ((error as Error & { code: string }).code) {
    case "disabled":
      return { status: 503, code: "API_DISABLED" };
    case "invalid_code":
      return { status: 400, code: "WECHAT_LOGIN_FAILED" };
    case "provider_unavailable":
      return { status: 502, code: "WECHAT_PROVIDER_UNAVAILABLE" };
    default:
      return null;
  }
}

export async function miniappRoute(
  request: Request,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  if (!config.miniappApiEnabled()) {
    return apiError(request, 503, "API_DISABLED");
  }
  try {
    return await handler();
  } catch (error) {
    if (error instanceof MiniAppApiError) {
      return apiError(request, error.status, error.code, error.fields);
    }
    const authFailure = miniProgramAuthFailure(error);
    if (authFailure) {
      return apiError(request, authFailure.status, authFailure.code);
    }
    // Never log error messages or request bodies here: provider errors and
    // Prisma inputs can contain OpenIDs, login codes, or legacy cancel tokens.
    const errorName = error instanceof Error ? error.name : "UnknownError";
    console.error(
      `[miniapp-api:${requestId(request)}] unhandled ${errorName}`
    );
    return apiError(request, 500, "INTERNAL_ERROR");
  }
}

export function invalidCursor(): never {
  throw new MiniAppApiError(400, "INVALID_CURSOR");
}
