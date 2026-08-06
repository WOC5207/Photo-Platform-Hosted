/**
 * Accept only ordinary web links for photographer-controlled outbound URLs.
 * Native `type="url"` validation is not a server-side security boundary.
 */
export function isSafeExternalHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.hostname.length > 0 &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
}

/** Return a normalized safe URL, or an empty string for legacy unsafe data. */
export function safeExternalHttpUrl(value: string): string {
  const trimmed = value.trim();
  return isSafeExternalHttpUrl(trimmed) ? trimmed : "";
}
