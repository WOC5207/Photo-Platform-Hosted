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
  { label: "QR labels", route: "/[locale]/dashboard/(protected)/equipment/qr-labels/page", limitKb: 140 }
];

for (const budget of routeBudgets) {
  const routeFiles = Array.from(new Set(appManifest.pages?.[budget.route] ?? []));
  if (routeFiles.length === 0) throw new Error(`Missing build manifest route: ${budget.route}`);
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
