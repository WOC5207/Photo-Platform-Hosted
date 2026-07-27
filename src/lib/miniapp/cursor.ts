import { createHmac, timingSafeEqual } from "crypto";

const CURSOR_VERSION = 1;

interface CursorEnvelope {
  v: typeof CURSOR_VERSION;
  k: string;
  p: Array<string | number | null>;
}

function cursorSecret(): string {
  const secret =
    process.env.MINIAPP_CURSOR_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim();
  if (!secret) {
    throw new Error(
      "MINIAPP_CURSOR_SECRET or SESSION_SECRET is required for miniapp cursors"
    );
  }
  return secret;
}

function signature(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payload).digest();
}

/**
 * Creates a URL-safe, authenticated cursor. The payload is intentionally not
 * an API contract: callers must treat the returned value as an opaque token.
 */
export function encodeCursor(
  kind: string,
  position: Array<string | number | null>,
  secret = cursorSecret()
): string {
  const envelope: CursorEnvelope = {
    v: CURSOR_VERSION,
    k: kind,
    p: position
  };
  const payload = Buffer.from(JSON.stringify(envelope)).toString("base64url");
  const mac = signature(payload, secret).toString("base64url");
  return `${payload}.${mac}`;
}

/**
 * Verifies and decodes a cursor for one list. Returning null rather than
 * throwing lets route handlers consistently map malformed/tampered cursors to
 * the stable INVALID_CURSOR error.
 */
export function decodeCursor(
  cursor: string | null | undefined,
  expectedKind: string,
  secret = cursorSecret()
): Array<string | number | null> | null {
  if (!cursor || cursor.length > 2048) return null;
  const [payload, suppliedMac, extra] = cursor.split(".");
  if (!payload || !suppliedMac || extra) return null;

  try {
    const actual = signature(payload, secret);
    const supplied = Buffer.from(suppliedMac, "base64url");
    if (
      supplied.length !== actual.length ||
      !timingSafeEqual(supplied, actual)
    ) {
      return null;
    }

    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as Partial<CursorEnvelope>;
    if (
      parsed.v !== CURSOR_VERSION ||
      parsed.k !== expectedKind ||
      !Array.isArray(parsed.p) ||
      !parsed.p.every(
        (value) =>
          value === null ||
          typeof value === "string" ||
          (typeof value === "number" && Number.isFinite(value))
      )
    ) {
      return null;
    }
    return parsed.p;
  } catch {
    return null;
  }
}

export function parsePageSize(
  value: string | null | undefined,
  fallback = 20
): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, 50);
}
