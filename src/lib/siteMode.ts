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
 * "equipment" is their inventory, with "equipmentNew", "equipmentItem" (`id`
 * names the item), "categories", "contact" (the QR page's contact details)
 * and "labels" (the QR label sheet) under it. "preparation" lists their
 * packing checklists, "checklist" is one of them (`id`), and "slotSheet" is
 * their booked slots to mark finished. "posters" lists their saved
 * Sharepost posters, and "poster" (`id`) opens one in the editor, whose
 * steps follow. "credits", "storage" and "site" are their credit profiles,
 * disk use and site settings, with a page per settings group under "site".
 */
export type StudioPage = keyof typeof STUDIO;

/**
 * Each Dashboard page: its path under /studio (":id" stands for its id), the
 * page Esc climbs to, and its classic twin's path under /dashboard when that
 * differs. A page with a fixed segment comes before one with an id there.
 */
const STUDIO = {
  home: ["", null],
  events: ["/events", "home"],
  new: ["/events/new", "events"],
  event: ["/events/:id", "events"],
  // The classic event page manages its photos; its /photos page adds them.
  photos: ["/events/:id/photos", "event", "/events/:id"],
  upload: ["/events/:id/upload", "event", "/events/:id/photos"],
  bookings: ["/bookings", "home"],
  booking: ["/bookings/:id", "bookings"],
  // The classic booking page keeps the event's settings in its overview tab.
  bookingDetails: ["/bookings/:id/details", "booking", "/bookings/:id?section=overview"],
  lottery: ["/bookings/:id/lottery", "booking"],
  equipment: ["/equipment", "home"],
  equipmentNew: ["/equipment/new", "equipment"],
  categories: ["/equipment/categories", "equipment", "/equipment/manage"],
  contact: ["/equipment/contact", "equipment"],
  labels: ["/equipment/labels", "equipment", "/equipment/qr-labels"],
  equipmentItem: ["/equipment/:id", "equipment"],
  // The classic preparation pages are tabs: booked slots and checklists.
  preparation: ["/preparation", "home", "/preparation/equipment"],
  slotSheet: ["/preparation/slots", "preparation"],
  checklist: ["/preparation/:id", "preparation", "/preparation/equipment/:id"],
  // A saved Sharepost opens in the 3D editor; its steps are one classic page.
  posters: ["/posters", "home", "/sharing-posters"],
  poster: ["/posters/:id", "posters", "/sharing-posters/:id"],
  posterLayout: ["/posters/:id/layout", "poster", "/sharing-posters/:id"],
  posterCredits: ["/posters/:id/credits", "posterLayout", "/sharing-posters/:id"],
  posterPrint: ["/posters/:id/print", "posterCredits", "/sharing-posters/:id"],
  credits: ["/credits", "home"],
  storage: ["/storage", "home"],
  // The classic settings page is tabs; each is a page here, under a menu.
  siteAppearance: ["/site/appearance", "site", "/settings?section=appearance"],
  siteHomepage: ["/site/homepage", "site", "/settings?section=homepage"],
  siteContact: ["/site/contact", "site", "/settings?section=contact"],
  siteFeatures: ["/site/features", "site", "/settings?section=features"],
  account: ["/site/account", "site", "/settings?section=profile"],
  site: ["/site", "home", "/settings"]
} as const satisfies Record<string, readonly [string, string | null, string?]>;

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

/**
 * The Dashboard page at these segments under /studio, or (`classic`) under
 * /dashboard, where a twin with a query (a classic tab) needs that query.
 */
function matchStudio(rest: string[], classic?: URLSearchParams): { page: StudioPage; id?: string } | null {
  // Tabs first, so a tab's page wins over the page it is a tab of.
  for (const tabbed of [true, false]) {
    for (const [page, [tail, , twin]] of Object.entries(STUDIO) as [StudioPage, readonly [string, string | null, string?]][]) {
      const [path, tab] = (classic ? (twin ?? tail) : tail).split("?");
      if (!tab === tabbed || (tab && [...new URLSearchParams(tab)].some(([k, v]) => classic?.get(k) !== v))) continue;
      const want = path.split("/").filter(Boolean);
      if (want.length !== rest.length) continue;
      const at = want.indexOf(":id");
      if (want.every((part, i) => (i === at ? SEGMENT.test(rest[i]) : part === rest[i]))) return at < 0 ? { page } : { page, id: rest[at] };
    }
  }
  return null;
}

function parseStudio(username: string, rest: string[]): Screen | null {
  const match = matchStudio(rest);
  return match && { kind: "studio", username, ...match };
}

const enc = encodeURIComponent;

/** A Dashboard page's path under /studio, and its classic twin's under /dashboard. */
function studioTail(screen: Extract<Screen, { kind: "studio" }>, classic = false): string {
  const [tail, , twin] = STUDIO[screen.page] as readonly [string, string | null, string?];
  return ((classic && twin) || tail).replace(":id", enc(screen.id ?? ""));
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
      const parent = STUDIO[screen.page][1];
      if (!parent) return { kind: "title" };
      const up: Screen = { kind: "studio", username: screen.username, page: parent };
      return STUDIO[parent][0].includes(":id") ? { ...up, id: screen.id } : up;
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

/**
 * The Dashboard page under /3d/studio for a classic /dashboard page's
 * segments: the nearest page up its path, so a classic page without a 3D
 * one opens its parent (or the Dashboard's menu).
 */
function studioFromClassic(rest: string[], path: string): string {
  // New booking events are made with their gallery, from "New event".
  if (rest[0] === "bookings" && rest[1] === "new") return "/events/new";
  const query = new URLSearchParams(path.split("?")[1]?.split("#")[0] ?? "");
  for (let n = rest.length; n > 0; n--) {
    for (const classic of [query, undefined]) {
      const match = matchStudio(rest.slice(0, n), classic);
      if (!match) continue;
      let { page } = match;
      // The classic booking page's advanced tab holds settings too, and the
      // classic event page opens on its photo manager with #photos.
      if (page === "booking" && query.get("section") === "advanced") page = "bookingDetails";
      if (page === "event" && path.includes("#photos")) page = "photos";
      // The classic preparation tabs narrow to one event with ?event=; so do these.
      const event = query.get("event");
      const keep = (page === "preparation" || page === "slotSheet") && event && SEGMENT.test(event) ? `?event=${enc(event)}` : "";
      return studioTail({ kind: "studio", username: "", ...match, page }) + keep;
    }
  }
  return "";
}

/** Cookie string that remembers the visitor's site. */
export function siteModeCookie(mode: SiteMode): string {
  return `${SITE_MODE_COOKIE}=${mode}; Path=/; Max-Age=${SITE_MODE_MAX_AGE}; SameSite=Lax`;
}
