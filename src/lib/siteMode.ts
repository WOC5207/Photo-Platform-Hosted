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
  | { kind: "login" }
  | { kind: "cosplan"; step?: CosplanStep }
  | { kind: "sharepost"; step?: SharepostStep }
  | { kind: "photographer"; username: string }
  | { kind: "albumSelect"; username: string }
  | { kind: "album"; username: string; slug: string; study: boolean }
  | { kind: "table"; username: string; slug: string }
  | { kind: "photo"; username: string; slug: string; photoId: string }
  | { kind: "booking"; username: string }
  | { kind: "book"; username: string; token: string }
  | { kind: "draw"; username: string; token: string }
  | { kind: "studio"; username: string; page: StudioPage; id?: string };

/**
 * The 3D Dashboard, a photographer's own backend under their address:
 * "home" is its menu, "events" their events (drafts too), "new" creates one,
 * and "event", "photos" and "upload" are one event's details, its photos on
 * the light table, and adding photos to it (`id` names the event).
 * "bookings" lists their booking events; "booking", "bookingDetails" and
 * "lottery" are one booking event's schedule, its settings and its prize
 * draw (`id` names the booking event).
 */
export type StudioPage =
  | "home"
  | "events"
  | "new"
  | "event"
  | "photos"
  | "upload"
  | "bookings"
  | "booking"
  | "bookingDetails"
  | "lottery";
const EVENT_PAGES = ["photos", "upload"] as const;
/** A booking event's pages after its schedule, by their path segment. */
const BOOKING_PAGES: Record<string, StudioPage> = { details: "bookingDetails", lottery: "lottery" };

/**
 * The poster creators' steps after their first screen: Cosplan picks a
 * background, then edits on the board and prints; Sharepost lays out
 * photographs, then sets the layout and credits and prints.
 */
export const COSPLAN_STEPS = ["board", "print"] as const;
export type CosplanStep = (typeof COSPLAN_STEPS)[number];
export const SHAREPOST_STEPS = ["layout", "credits", "print"] as const;
export type SharepostStep = (typeof SHAREPOST_STEPS)[number];

/** Booking and prize-draw links are opaque tokens, as on the classic pages. */
const TOKEN = /^[a-z0-9]+$/;

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
  if (rest.length === 1 && rest[0] === "login") return { kind: "login" };
  if (rest.length === 1 && rest[0] === "cosplan") return { kind: "cosplan" };
  if (rest.length === 1 && rest[0] === "sharepost") return { kind: "sharepost" };
  if (rest.length === 2 && rest[0] === "cosplan" && (COSPLAN_STEPS as readonly string[]).includes(rest[1])) {
    return { kind: "cosplan", step: rest[1] as CosplanStep };
  }
  if (rest.length === 2 && rest[0] === "sharepost" && (SHAREPOST_STEPS as readonly string[]).includes(rest[1])) {
    return { kind: "sharepost", step: rest[1] as SharepostStep };
  }
  if (rest[0] !== "u" || !rest[1] || !SEGMENT.test(rest[1])) return null;
  const username = rest[1];
  if (rest.length === 2) return { kind: "photographer", username };
  if (rest.length === 3 && rest[2] === "booking") return { kind: "booking", username };
  if (rest.length === 4 && (rest[2] === "book" || rest[2] === "draw") && TOKEN.test(rest[3])) {
    return { kind: rest[2], username, token: rest[3] };
  }
  if (rest[2] === "studio") return parseStudio(username, rest.slice(3));
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

function parseStudio(username: string, rest: string[]): Screen | null {
  if (rest.length === 0) return { kind: "studio", username, page: "home" };
  if (rest[0] === "bookings") {
    if (rest.length === 1) return { kind: "studio", username, page: "bookings" };
    if (!SEGMENT.test(rest[1])) return null;
    if (rest.length === 2) return { kind: "studio", username, page: "booking", id: rest[1] };
    const page = rest.length === 3 && Object.hasOwn(BOOKING_PAGES, rest[2]) ? BOOKING_PAGES[rest[2]] : null;
    return page ? { kind: "studio", username, page, id: rest[1] } : null;
  }
  if (rest[0] !== "events") return null;
  if (rest.length === 1) return { kind: "studio", username, page: "events" };
  if (rest.length === 2 && rest[1] === "new") return { kind: "studio", username, page: "new" };
  if (!SEGMENT.test(rest[1])) return null;
  if (rest.length === 2) return { kind: "studio", username, page: "event", id: rest[1] };
  if (rest.length === 3 && (EVENT_PAGES as readonly string[]).includes(rest[2])) {
    return { kind: "studio", username, page: rest[2] as StudioPage, id: rest[1] };
  }
  return null;
}

const enc = encodeURIComponent;

/** A Dashboard page's path under /studio, and its classic twin's under /dashboard. */
function studioTail(screen: Extract<Screen, { kind: "studio" }>, classic = false): string {
  const event = `/events/${enc(screen.id ?? "")}`;
  const booking = `/bookings/${enc(screen.id ?? "")}`;
  switch (screen.page) {
    case "home":
      return "";
    case "events":
      return "/events";
    case "new":
      return "/events/new";
    case "event":
      return event;
    // The classic event page manages its photos; its /photos page adds them.
    case "photos":
      return classic ? event : `${event}/photos`;
    case "upload":
      return `${event}/${classic ? "photos" : "upload"}`;
    case "bookings":
      return "/bookings";
    case "booking":
      return booking;
    // The classic booking page keeps the event's settings in its overview tab.
    case "bookingDetails":
      return classic ? `${booking}?section=overview` : `${booking}/details`;
    case "lottery":
      return `${booking}/lottery`;
  }
}

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
    case "login":
      return `${THREE_D_ROOT}/login`;
    case "cosplan":
    case "sharepost":
      return `${THREE_D_ROOT}/${screen.kind}${screen.step ? `/${screen.step}` : ""}`;
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
    case "booking":
      return `${THREE_D_ROOT}/u/${enc(screen.username)}/booking`;
    case "book":
    case "draw":
      return `${THREE_D_ROOT}/u/${enc(screen.username)}/${screen.kind}/${enc(screen.token)}`;
    case "studio":
      return `${THREE_D_ROOT}/u/${enc(screen.username)}/studio${studioTail(screen)}`;
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
    case "login":
      return { kind: "title" };
    case "cosplan":
      // Printing goes back to the board; the board, to the backgrounds.
      return screen.step === "print" ? { kind: "cosplan", step: "board" } : screen.step ? { kind: "cosplan" } : { kind: "title" };
    case "sharepost": {
      // One step back at a time: print, credits, layout, then the photos.
      const at = screen.step ? SHAREPOST_STEPS.indexOf(screen.step) : -1;
      if (at < 0) return { kind: "title" };
      return at === 0 ? { kind: "sharepost" } : { kind: "sharepost", step: SHAREPOST_STEPS[at - 1] };
    }
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
    case "booking":
      return { kind: "photographer", username: screen.username };
    case "book":
    case "draw":
      return { kind: "booking", username: screen.username };
    case "studio": {
      const { username, id } = screen;
      if (screen.page === "home") return { kind: "title" };
      if (screen.page === "events") return { kind: "studio", username, page: "home" };
      if (screen.page === "photos" || screen.page === "upload") return { kind: "studio", username, page: "event", id };
      if (screen.page === "bookings") return { kind: "studio", username, page: "home" };
      if (screen.page === "bookingDetails" || screen.page === "lottery") return { kind: "studio", username, page: "booking", id };
      if (screen.page === "booking") return { kind: "studio", username, page: "bookings" };
      return { kind: "studio", username, page: "events" };
    }
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
    case "login":
      return "/login";
    case "cosplan":
      return "/cosplan";
    case "sharepost":
      return "/sharing-poster";
    case "photographer":
      return `/u/${enc(screen.username)}`;
    case "albumSelect":
      return `/u/${enc(screen.username)}/gallery`;
    case "album":
    case "table":
      return `/u/${enc(screen.username)}/gallery/${enc(screen.slug)}`;
    case "photo":
      return `/u/${enc(screen.username)}/gallery/${enc(screen.slug)}?photo=${enc(screen.photoId)}`;
    case "booking":
      return `/u/${enc(screen.username)}/booking`;
    case "book":
    case "draw":
      return `/${screen.kind}/${enc(screen.token)}`;
    case "studio":
      return `/dashboard${studioTail(screen, true)}`;
  }
}

/**
 * The 3D screen that shows the same thing as a classic page. Pages the 3D
 * site has no screen for yet land on their photographer, or the title.
 */
export function threeDTwin(path: string): string {
  const parts = segments(path);
  if (parts[0] === "3d") return path;
  // The creators keep their drafts in the browser, so both sides open the same one.
  if (parts.length === 1 && parts[0] === "cosplan") return screenPath({ kind: "cosplan" });
  if (parts.length === 1 && parts[0] === "sharing-poster") return screenPath({ kind: "sharepost" });
  if (parts.length === 1 && parts[0] === "login") return screenPath({ kind: "login" });
  // The dashboard names no one; /3d/studio forwards to the signed-in
  // photographer's own address.
  if (parts[0] === "dashboard") return `${THREE_D_ROOT}/studio${studioFromClassic(parts.slice(1), path)}`;
  // Booking and draw links name only their token; /3d/book/<token> looks up
  // the photographer and forwards to their address.
  if ((parts[0] === "book" || parts[0] === "draw") && parts[1] && TOKEN.test(parts[1]) && parts.length === 2) {
    return `${THREE_D_ROOT}/${parts[0]}/${parts[1]}`;
  }
  if (parts[0] !== "u" || !parts[1] || !SEGMENT.test(parts[1])) return THREE_D_ROOT;
  const username = parts[1];
  if (parts[2] === "gallery" && parts[3] && parts.length === 4) {
    // The classic lightbox opens a photo with ?photo=<id>.
    const photoId = new URLSearchParams(path.split("?")[1]?.split("#")[0] ?? "").get("photo");
    if (photoId && SEGMENT.test(photoId)) return screenPath({ kind: "photo", username, slug: parts[3], photoId });
    return screenPath({ kind: "album", username, slug: parts[3], study: false });
  }
  if (parts[2] === "gallery" && parts.length === 3) return screenPath({ kind: "albumSelect", username });
  if (parts[2] === "booking" && parts.length === 3) return screenPath({ kind: "booking", username });
  return screenPath({ kind: "photographer", username });
}

/** The Dashboard page under /3d/studio for a classic /dashboard page's segments. */
function studioFromClassic(rest: string[], path: string): string {
  if (rest[0] === "bookings") return bookingsFromClassic(rest, path);
  // Sections without a 3D page yet open the Dashboard's menu.
  if (rest[0] !== "events") return "";
  if (rest.length === 1) return "/events";
  const id = rest[1];
  if (rest.length === 2) {
    if (id === "new") return "/events/new";
    // The classic page opens on its photo manager with #photos.
    return SEGMENT.test(id) ? `/events/${enc(id)}${path.includes("#photos") ? "/photos" : ""}` : "/events";
  }
  if (rest.length === 3 && rest[2] === "photos" && SEGMENT.test(id)) return `/events/${enc(id)}/upload`;
  return SEGMENT.test(id) ? `/events/${enc(id)}` : "/events";
}

/** The Dashboard's booking page for a classic /dashboard/bookings page's segments. */
function bookingsFromClassic(rest: string[], path: string): string {
  if (rest.length === 1) return "/bookings";
  const id = rest[1];
  // New booking events are made with their gallery, from "New event".
  if (id === "new") return "/events/new";
  if (!SEGMENT.test(id)) return "/bookings";
  if (rest.length === 3 && rest[2] === "lottery") return `/bookings/${enc(id)}/lottery`;
  // The overview and advanced tabs hold the settings; the schedule is the default.
  return /[?&]section=(overview|advanced)\b/.test(path) ? `/bookings/${enc(id)}/details` : `/bookings/${enc(id)}`;
}

/** Cookie string that remembers the visitor's site. */
export function siteModeCookie(mode: SiteMode): string {
  return `${SITE_MODE_COOKIE}=${mode}; Path=/; Max-Age=${SITE_MODE_MAX_AGE}; SameSite=Lax`;
}
