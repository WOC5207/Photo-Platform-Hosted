import { readFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";

const root = process.cwd();
const manifest = JSON.parse(readFileSync(path.join(root, ".next", "build-manifest.json"), "utf8")) as {
  rootMainFiles?: string[];
};
const files = Array.from(new Set(manifest.rootMainFiles ?? []));
const gzipBytes = files.reduce((sum, file) => {
  const absolute = path.join(root, ".next", file);
  statSync(absolute);
  return sum + gzipSync(readFileSync(absolute)).byteLength;
}, 0);
const limit = 105 * 1024;
console.log(`Shared first-load JavaScript: ${(gzipBytes / 1024).toFixed(1)} KB gzip (budget 105 KB)`);
if (gzipBytes > limit) {
  console.error("Shared JavaScript budget exceeded.");
  process.exitCode = 1;
}

// CI builds with a fixed NEXT_SERVER_ACTIONS_ENCRYPTION_KEY. Next salts each
// server action's ID with that key, and a random key per build gives random
// IDs that gzip a little better or worse each time: the same code measured up
// to 0.2 KB apart from run to run, so a page at its budget passed or failed by
// chance. These sizes are from the fixed key.
const appManifest = JSON.parse(
  readFileSync(path.join(root, ".next", "app-build-manifest.json"), "utf8")
) as { pages?: Record<string, string[]> };
const routeBudgets = [
  { label: "Dashboard", route: "/[locale]/dashboard/(protected)/page", limitKb: 125 },
  { label: "Bookings", route: "/[locale]/dashboard/(protected)/bookings/page", limitKb: 125 },
  { label: "Settings", route: "/[locale]/dashboard/(protected)/settings/page", limitKb: 140 },
  { label: "QR labels", route: "/[locale]/dashboard/(protected)/equipment/qr-labels/page", limitKb: 140 },
  { label: "Sharing posters", route: "/[locale]/dashboard/(protected)/sharing-posters/[id]/page", limitKb: 140 },
  { label: "Cosplan", route: "/[locale]/(directory)/cosplan/page", limitKb: 140 },
  { label: "Public sharing poster", route: "/[locale]/(directory)/sharing-poster/page", limitKb: 140 },
  // three.js loads after first paint, so only the overlay counts here. It
  // lives in the /3d layout, which the page entry doesn't list. The header
  // controls (mode, language and theme switches) come as a chunk shared with
  // the homepage, which gzips about 1 KB worse than when they were inlined.
  // The 3D Dashboard's routes and crumbs add about half a KB, and the
  // signed-in name, the album pages' lane lock and the 360° picture list's
  // wiring a little more. Bringing in an address the field leaves out, and
  // the plain list's order and inert backdrop without WebGL, add almost a KB
  // to every 3D route. Measured with the fixed key, the title menu's
  // two-column marker and the Dashboard home's album field put it a few bytes
  // over. On phones a visitor's pages fill the screen over the scene, which
  // stays as a backdrop, with an album list and the light table's prints as a
  // grid; that adds about 0.8 KB to every 3D route.
  { label: "3D site", route: ["/[locale]/3d/layout", "/[locale]/3d/page"], limitKb: 144 },
  // The poster creators open from the title menu; their poster code and the
  // easel scene load with the draft, after the panel paints. Each creator's
  // steps share a studio layout that holds the draft, so it counts too. The
  // Cosplan board carries the arranging, text and upload-name panels; the Sharepost
  // credits step reuses the classic editor's credit layers, and every
  // Sharepost step carries the step bar with its Back button. The Dashboard's
  // routes in the shared 3D code add a little to each. The credits steps
  // validate the draft's credit lines with zod, whose security update to
  // 4.6.7 added about 8 KB to each. The title menu's marker following its
  // items into two columns, with the Dashboard home's album field, tipped the
  // board over by a few bytes. Keeping that field to the photographer's own
  // albums adds about 0.2 KB to every 3D route, which took the Cosplan and
  // Sharepost first steps to their budgets. The phone Dashboard home's step
  // buttons and Expand button add 0.2 KB more, which took the board and the
  // Sharepost credits step over.
  { label: "3D Cosplan", route: ["/[locale]/3d/layout", "/[locale]/3d/cosplan/layout", "/[locale]/3d/cosplan/page"], limitKb: 159 },
  { label: "3D Cosplan board", route: ["/[locale]/3d/layout", "/[locale]/3d/cosplan/layout", "/[locale]/3d/cosplan/board/page"], limitKb: 167 },
  { label: "3D Sharepost", route: ["/[locale]/3d/layout", "/[locale]/3d/sharepost/layout", "/[locale]/3d/sharepost/page"], limitKb: 158 },
  { label: "3D Sharepost credits", route: ["/[locale]/3d/layout", "/[locale]/3d/sharepost/layout", "/[locale]/3d/sharepost/credits/page"], limitKb: 192 },
  // The 3D Dashboard's screens come with their pages. Adding photos carries
  // the classic photo wizard and its upload queue. The home's browsable album
  // field, and the window its phone sheet opens on, add about half a KB to each;
  // with the title menu's two-column marker that tipped the categories,
  // preparation, credits, bookings, posters and account pages over by a few
  // bytes. The offer to reduce motion when frames run slow, or when the device
  // asks for less, tipped nine more over by under 0.2 KB. Scrolling the phone
  // sheet under its window instead of the whole sheet tipped the photos,
  // booking settings and checklist pages over by a few more. Keeping the
  // field to the photographer's own albums, with their previews popping up,
  // adds about 0.2 KB more to each, which took my archive and thirteen
  // Dashboard pages over or to within a few bytes of their budgets. The phone
  // home's step buttons, Expand button and clearer window add 0.2 to 0.5 KB
  // more, which took thirteen Dashboard pages over or to their budgets.
  { label: "3D my archive", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/page"], limitKb: 152 },
  { label: "3D Dashboard", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/page"], limitKb: 153 },
  { label: "3D Dashboard events", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/events/page"], limitKb: 152 },
  { label: "3D Dashboard event", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/events/[id]/page"], limitKb: 152 },
  { label: "3D Dashboard photos", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/events/[id]/photos/page"], limitKb: 153 },
  { label: "3D Dashboard upload", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/events/[id]/upload/page"], limitKb: 165 },
  // The booking pages reuse the classic slot, status and prize-draw forms.
  { label: "3D Dashboard bookings", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/bookings/page"], limitKb: 151 },
  { label: "3D Dashboard schedule", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/bookings/[id]/page"], limitKb: 158 },
  { label: "3D Dashboard booking settings", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/bookings/[id]/details/page"], limitKb: 151 },
  { label: "3D Dashboard prize draw", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/bookings/[id]/lottery/page"], limitKb: 157 },
  // Equipment stands its ID cards on the easel; adding and editing share the
  // form, and the label sheet draws its labels with the classic tool's code.
  // A checklist carries the classic QR scanner. The shared 3D code's
  // photographer palettes tipped the item page over by a few bytes. The
  // inventory's desktop list of items under its search adds most of a KB.
  { label: "3D Dashboard equipment", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/equipment/page"], limitKb: 159 },
  { label: "3D Dashboard add equipment", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/equipment/new/page"], limitKb: 160 },
  { label: "3D Dashboard equipment item", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/equipment/[id]/page"], limitKb: 160 },
  { label: "3D Dashboard categories", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/equipment/categories/page"], limitKb: 153 },
  { label: "3D Dashboard QR contact", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/equipment/contact/page"], limitKb: 151 },
  { label: "3D Dashboard QR labels", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/equipment/labels/page"], limitKb: 160 },
  // Preparation shows checklists and booked slots on the booking board.
  { label: "3D Dashboard preparation", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/preparation/page"], limitKb: 152 },
  { label: "3D Dashboard checklist", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/preparation/[id]/page"], limitKb: 163 },
  { label: "3D Dashboard booked slots", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/preparation/slots/page"], limitKb: 153 },
  // Saved posters stand on the easel's rail and open in the 3D Sharepost
  // editor, whose draft lives in the poster's layout as /3d/sharepost's does;
  // a project adds the gallery picker (loaded when opened) and server saves.
  { label: "3D Dashboard posters", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/posters/page"], limitKb: 154 },
  { label: "3D Dashboard poster", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/posters/[id]/layout", "/[locale]/3d/u/[username]/studio/posters/[id]/page"], limitKb: 158 },
  { label: "3D Dashboard poster credits", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/posters/[id]/layout", "/[locale]/3d/u/[username]/studio/posters/[id]/credits/page"], limitKb: 192 },
  { label: "3D Dashboard credits", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/credits/page"], limitKb: 155 },
  { label: "3D Dashboard storage", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/storage/page"], limitKb: 152 },
  // Site settings: a menu, then a panel per group. Appearance carries the
  // classic palette editor and image uploads; homepage, the classic links and
  // announcements managers.
  { label: "3D Dashboard site", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/site/page"], limitKb: 152 },
  { label: "3D Dashboard appearance", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/site/appearance/page"], limitKb: 159 },
  { label: "3D Dashboard homepage", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/site/homepage/page"], limitKb: 157 },
  { label: "3D Dashboard visitor contact", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/site/contact/page"], limitKb: 154 },
  { label: "3D Dashboard features", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/site/features/page"], limitKb: 152 },
  { label: "3D Dashboard account", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/site/account/page"], limitKb: 153 },
  { label: "3D Dashboard setup", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/setup/page"], limitKb: 153 }
];

for (const budget of routeBudgets) {
  const routes = Array.isArray(budget.route) ? budget.route : [budget.route];
  const routeFiles = Array.from(
    new Set(
      routes.flatMap((route) => {
        const entry = appManifest.pages?.[route];
        if (!entry?.length) throw new Error(`Missing build manifest route: ${route}`);
        return entry;
      })
    )
  );
  const bytes = routeFiles.reduce(
    (sum, file) => sum + gzipSync(readFileSync(path.join(root, ".next", file))).byteLength,
    0
  );
  console.log(`${budget.label}: ${(bytes / 1024).toFixed(1)} KB gzip (budget ${budget.limitKb} KB)`);
  if (bytes > budget.limitKb * 1024) {
    console.error(`${budget.label} JavaScript budget exceeded.`);
    process.exitCode = 1;
  }
}
