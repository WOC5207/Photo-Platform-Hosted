/**
 * The two public sites: the classic pages and the 3D archive under /3d.
 *
 * A visitor flips between them with the switch on the homepage (or the 3D
 * site's "Classic site" item), which lands on the matching page on the other
 * side. Paths here carry no locale prefix: they are what the i18n
 * usePathname() returns and what its Link and router accept.
 *
 * Pure functions, shared by the middleware, server pages and the client.
 */

export const SITE_MODE_COOKIE = "site_mode";
export type SiteMode = "classic" | "3d";

/** One year: the choice should outlive a browser restart. */
export const SITE_MODE_MAX_AGE = 60 * 60 * 24 * 365;

export const THREE_D_ROOT = "/3d";

export type Screen =
  | { kind: "title" }
  | { kind: "albums" }
  | { kind: "photographers" }
  | { kind: "settings" }
  | { kind: "photographer"; username: string }
  | { kind: "albumSelect"; username: string }
  | { kind: "album"; username: string; slug: string; study: boolean }
  | { kind: "table"; username: string; slug: string }
  | { kind: "photo"; username: string; slug: string; photoId: string };

const SEGMENT = /^[^/?#]+$/;

function segments(path: string): string[] {
  return path.split(/[?#]/)[0].split("/").filter(Boolean).map((s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  });
}

/** Which 3D screen a /3d path shows, or null for anything else. */
export function parseScreen(path: string): Screen | null {
  const parts = segments(path);
  if (parts[0] !== "3d") return null;
  const rest = parts.slice(1);
  if (rest.length === 0) return { kind: "title" };
  if (rest.length === 1 && rest[0] === "albums") return { kind: "albums" };
  if (rest.length === 1 && rest[0] === "photographers") return { kind: "photographers" };
  if (rest.length === 1 && rest[0] === "settings") return { kind: "settings" };
  if (rest[0] !== "u" || !rest[1] || !SEGMENT.test(rest[1])) return null;
  const username = rest[1];
  if (rest.length === 2) return { kind: "photographer", username };
  if (rest[2] !== "albums") return null;
  if (rest.length === 3) return { kind: "albumSelect", username };
  const slug = rest[3];
  if (rest.length === 4) return { kind: "album", username, slug, study: false };
  if (rest.length === 5 && rest[4] === "360") return { kind: "album", username, slug, study: true };
  if (rest[4] !== "photos") return null;
  if (rest.length === 5) return { kind: "table", username, slug };
  if (rest.length === 6 && SEGMENT.test(rest[5])) return { kind: "photo", username, slug, photoId: rest[5] };
  return null;
}

const enc = encodeURIComponent;

/** The address of a 3D screen. */
export function screenPath(screen: Screen): string {
  switch (screen.kind) {
    case "title":
      return THREE_D_ROOT;
    case "albums":
      return `${THREE_D_ROOT}/albums`;
    case "photographers":
      return `${THREE_D_ROOT}/photographers`;
    case "settings":
      return `${THREE_D_ROOT}/settings`;
    case "photographer":
      return `${THREE_D_ROOT}/u/${enc(screen.username)}`;
    case "albumSelect":
      return `${THREE_D_ROOT}/u/${enc(screen.username)}/albums`;
    case "album":
      return `${THREE_D_ROOT}/u/${enc(screen.username)}/albums/${enc(screen.slug)}${screen.study ? "/360" : ""}`;
    case "table":
      return `${THREE_D_ROOT}/u/${enc(screen.username)}/albums/${enc(screen.slug)}/photos`;
    case "photo":
      return `${THREE_D_ROOT}/u/${enc(screen.username)}/albums/${enc(screen.slug)}/photos/${enc(screen.photoId)}`;
  }
}

/** The screen one step back, as Esc and the B button go. */
export function parentScreen(screen: Screen): Screen | null {
  switch (screen.kind) {
    case "title":
      return null;
    case "albums":
    case "photographers":
    case "settings":
      return { kind: "title" };
    case "photographer":
      return { kind: "photographers" };
    case "albumSelect":
      return { kind: "photographer", username: screen.username };
    case "album":
      return screen.study
        ? { ...screen, study: false }
        : { kind: "albumSelect", username: screen.username };
    case "table":
      return { kind: "album", username: screen.username, slug: screen.slug, study: false };
    case "photo":
      return { kind: "table", username: screen.username, slug: screen.slug };
  }
}

/** The classic page that shows the same thing as a 3D screen. */
export function classicTwin(path: string): string {
  const screen = parseScreen(path);
  if (!screen) return "/";
  switch (screen.kind) {
    case "title":
    case "albums":
    case "photographers":
    case "settings":
      return "/";
    case "photographer":
      return `/u/${enc(screen.username)}`;
    case "albumSelect":
      return `/u/${enc(screen.username)}/gallery`;
    case "album":
    case "table":
      return `/u/${enc(screen.username)}/gallery/${enc(screen.slug)}`;
    case "photo":
      return `/u/${enc(screen.username)}/gallery/${enc(screen.slug)}?photo=${enc(screen.photoId)}`;
  }
}

/**
 * The 3D screen that shows the same thing as a classic page. Pages the 3D
 * site has no screen for yet land on their photographer, or the title.
 */
export function threeDTwin(path: string): string {
  const parts = segments(path);
  if (parts[0] === "3d") return path;
  if (parts[0] !== "u" || !parts[1] || !SEGMENT.test(parts[1])) return THREE_D_ROOT;
  const username = parts[1];
  if (parts[2] === "gallery" && parts[3] && parts.length === 4) {
    // The classic lightbox opens a photo with ?photo=<id>.
    const photoId = new URLSearchParams(path.split("?")[1]?.split("#")[0] ?? "").get("photo");
    if (photoId && SEGMENT.test(photoId)) return screenPath({ kind: "photo", username, slug: parts[3], photoId });
    return screenPath({ kind: "album", username, slug: parts[3], study: false });
  }
  if (parts[2] === "gallery" && parts.length === 3) return screenPath({ kind: "albumSelect", username });
  return screenPath({ kind: "photographer", username });
}

/** Cookie string that remembers the visitor's site. */
export function siteModeCookie(mode: SiteMode): string {
  return `${SITE_MODE_COOKIE}=${mode}; Path=/; Max-Age=${SITE_MODE_MAX_AGE}; SameSite=Lax`;
}
