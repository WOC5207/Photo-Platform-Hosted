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
  // wiring a little more.
  { label: "3D site", route: ["/[locale]/3d/layout", "/[locale]/3d/page"], limitKb: 139 },
  // The poster creators open from the title menu; their poster code and the
  // easel scene load with the draft, after the panel paints. Each creator's
  // steps share a studio layout that holds the draft, so it counts too. The
  // Cosplan board carries the arranging and text panels; the Sharepost
  // credits step reuses the classic editor's credit layers, and every
  // Sharepost step carries the step bar with its Back button. The Dashboard's
  // routes in the shared 3D code add a little to each.
  { label: "3D Cosplan", route: ["/[locale]/3d/layout", "/[locale]/3d/cosplan/layout", "/[locale]/3d/cosplan/page"], limitKb: 152 },
  { label: "3D Cosplan board", route: ["/[locale]/3d/layout", "/[locale]/3d/cosplan/layout", "/[locale]/3d/cosplan/board/page"], limitKb: 158 },
  { label: "3D Sharepost", route: ["/[locale]/3d/layout", "/[locale]/3d/sharepost/layout", "/[locale]/3d/sharepost/page"], limitKb: 150 },
  { label: "3D Sharepost credits", route: ["/[locale]/3d/layout", "/[locale]/3d/sharepost/layout", "/[locale]/3d/sharepost/credits/page"], limitKb: 176 },
  // The 3D Dashboard's screens come with their pages. Adding photos carries
  // the classic photo wizard and its upload queue.
  { label: "3D Dashboard", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/page"], limitKb: 145 },
  { label: "3D Dashboard events", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/events/page"], limitKb: 145 },
  { label: "3D Dashboard event", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/events/[id]/page"], limitKb: 145 },
  { label: "3D Dashboard photos", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/events/[id]/photos/page"], limitKb: 146 },
  { label: "3D Dashboard upload", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/events/[id]/upload/page"], limitKb: 157 },
  // The booking pages reuse the classic slot, status and prize-draw forms.
  { label: "3D Dashboard bookings", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/bookings/page"], limitKb: 145 },
  { label: "3D Dashboard schedule", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/bookings/[id]/page"], limitKb: 151 },
  { label: "3D Dashboard booking settings", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/bookings/[id]/details/page"], limitKb: 146 },
  { label: "3D Dashboard prize draw", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/bookings/[id]/lottery/page"], limitKb: 151 },
  // Equipment stands its ID cards on the easel; adding and editing share the
  // form, and the label sheet draws its labels with the classic tool's code.
  // A checklist carries the classic QR scanner.
  { label: "3D Dashboard equipment", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/equipment/page"], limitKb: 151 },
  { label: "3D Dashboard add equipment", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/equipment/new/page"], limitKb: 152 },
  { label: "3D Dashboard equipment item", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/equipment/[id]/page"], limitKb: 152 },
  { label: "3D Dashboard categories", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/equipment/categories/page"], limitKb: 146 },
  { label: "3D Dashboard QR contact", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/equipment/contact/page"], limitKb: 145 },
  { label: "3D Dashboard QR labels", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/equipment/labels/page"], limitKb: 152 },
  // Preparation shows checklists and booked slots on the booking board.
  { label: "3D Dashboard preparation", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/preparation/page"], limitKb: 145 },
  { label: "3D Dashboard checklist", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/preparation/[id]/page"], limitKb: 155 },
  { label: "3D Dashboard booked slots", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/preparation/slots/page"], limitKb: 146 },
  // Saved posters stand on the easel's rail and open in the 3D Sharepost
  // editor, whose draft lives in the poster's layout as /3d/sharepost's does;
  // a project adds the gallery picker (loaded when opened) and server saves.
  { label: "3D Dashboard posters", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/posters/page"], limitKb: 147 },
  { label: "3D Dashboard poster", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/posters/[id]/layout", "/[locale]/3d/u/[username]/studio/posters/[id]/page"], limitKb: 150 },
  { label: "3D Dashboard poster credits", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/posters/[id]/layout", "/[locale]/3d/u/[username]/studio/posters/[id]/credits/page"], limitKb: 176 },
  { label: "3D Dashboard credits", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/credits/page"], limitKb: 147 },
  { label: "3D Dashboard storage", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/storage/page"], limitKb: 145 },
  // Site settings: a menu, then a panel per group. Appearance carries the
  // classic palette editor and image uploads; homepage, the classic links and
  // announcements managers.
  { label: "3D Dashboard site", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/site/page"], limitKb: 145 },
  { label: "3D Dashboard appearance", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/site/appearance/page"], limitKb: 152 },
  { label: "3D Dashboard homepage", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/site/homepage/page"], limitKb: 150 },
  { label: "3D Dashboard visitor contact", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/site/contact/page"], limitKb: 148 },
  { label: "3D Dashboard features", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/site/features/page"], limitKb: 146 },
  { label: "3D Dashboard account", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/site/account/page"], limitKb: 147 },
  { label: "3D Dashboard setup", route: ["/[locale]/3d/layout", "/[locale]/3d/u/[username]/studio/setup/page"], limitKb: 147 }
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
