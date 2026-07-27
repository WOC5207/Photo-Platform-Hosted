import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const contractPath = path.join(root, "openapi", "miniapp-v1.yaml");
const contract = fs
  .readFileSync(contractPath, "utf8")
  .replace(/\r\n?/g, "\n");

const operations: Array<{
  path: string;
  method: "GET" | "POST" | "DELETE";
  route: string;
}> = [
  { path: "/bootstrap", method: "GET", route: "bootstrap" },
  { path: "/auth/wechat", method: "POST", route: "auth/wechat" },
  { path: "/auth/session", method: "DELETE", route: "auth/session" },
  { path: "/photographers", method: "GET", route: "photographers" },
  {
    path: "/photographers/{username}",
    method: "GET",
    route: "photographers/[username]"
  },
  {
    path: "/photographers/{username}/albums",
    method: "GET",
    route: "photographers/[username]/albums"
  },
  {
    path: "/photographers/{username}/albums/{slug}/photos",
    method: "GET",
    route: "photographers/[username]/albums/[slug]/photos"
  },
  {
    path: "/photographers/{username}/search",
    method: "GET",
    route: "photographers/[username]/search"
  },
  {
    path: "/photographers/{username}/booking-events",
    method: "GET",
    route: "photographers/[username]/booking-events"
  },
  {
    path: "/booking-events/{token}",
    method: "GET",
    route: "booking-events/[token]"
  },
  {
    path: "/booking-events/{token}/bookings",
    method: "POST",
    route: "booking-events/[token]/bookings"
  },
  { path: "/me/bookings", method: "GET", route: "me/bookings" },
  {
    path: "/me/bookings/{id}/cancel",
    method: "POST",
    route: "me/bookings/[id]/cancel"
  },
  {
    path: "/me/bookings/import",
    method: "POST",
    route: "me/bookings/import"
  },
  {
    path: "/lottery-draws/{token}",
    method: "GET",
    route: "lottery-draws/[token]"
  },
  {
    path: "/lottery-draws/{token}/entries",
    method: "POST",
    route: "lottery-draws/[token]/entries"
  },
  {
    path: "/lottery-entries/{id}/spin",
    method: "POST",
    route: "lottery-entries/[id]/spin"
  },
  {
    path: "/me/lottery-entries/import",
    method: "POST",
    route: "me/lottery-entries/import"
  },
  {
    path: "/photos/{id}/reports",
    method: "POST",
    route: "photos/[id]/reports"
  },
  { path: "/me", method: "DELETE", route: "me" }
];

const paginatedPaths = new Set([
  "/photographers",
  "/photographers/{username}/albums",
  "/photographers/{username}/albums/{slug}/photos",
  "/photographers/{username}/search",
  "/photographers/{username}/booking-events",
  "/me/bookings"
]);

const declaredPaths = [...contract.matchAll(/^  (\/[^:]+):$/gm)].map(
  (match) => match[1]
);
assert.equal(
  declaredPaths.length,
  operations.length,
  "the contract must expose exactly the planned v1 paths"
);
assert.deepEqual(
  new Set(declaredPaths),
  new Set(operations.map((operation) => operation.path)),
  "route and contract path sets must match"
);

for (const operation of operations) {
  const routePath = path.join(
    root,
    "src",
    "app",
    "api",
    "v1",
    "miniapp",
    ...operation.route.split("/"),
    "route.ts"
  );
  assert.equal(fs.existsSync(routePath), true, `missing ${routePath}`);
  const route = fs.readFileSync(routePath, "utf8");
  assert.match(
    route,
    new RegExp(`export async function ${operation.method}\\b`),
    `${operation.method} ${operation.path} must have a Next route`
  );
  assert.match(
    route,
    /\bminiappRoute\s*\(/,
    `${operation.method} ${operation.path} must use the global fail-closed wrapper`
  );

  const start = contract.indexOf(`  ${operation.path}:\n`);
  assert.notEqual(start, -1, `missing OpenAPI path ${operation.path}`);
  const next = declaredPaths
    .map((candidate) => contract.indexOf(`  ${candidate}:\n`, start + 1))
    .filter((index) => index > start)
    .sort((a, b) => a - b)[0];
  const block = contract.slice(start, next ?? contract.indexOf("\ncomponents:"));
  assert.match(block, /^\s{8}"2\d\d":/m, `${operation.path} needs a success response`);
  assert.match(
    block,
    /^\s{8}"(?:4|5)\d\d":/m,
    `${operation.path} needs a stable failure response`
  );

  if (paginatedPaths.has(operation.path)) {
    assert.match(
      block,
      /- \$ref: "#\/components\/parameters\/Cursor"/,
      `${operation.path} must accept an opaque cursor`
    );
    assert.match(
      block,
      /- \$ref: "#\/components\/parameters\/Limit"/,
      `${operation.path} must accept the shared capped limit`
    );
    assert.match(
      block,
      /- \$ref: "#\/components\/schemas\/PaginatedEnvelope"/,
      `${operation.path} must return PageMeta`
    );
    assert.match(
      block,
      /"400":\s*\n\s+\$ref: "#\/components\/responses\/InvalidCursor"/,
      `${operation.path} must document invalid cursors`
    );
  }

  if (operation.path === "/me/bookings") {
    assert.match(
      route,
      /\bparsePageSize\s*\(/,
      "the owned-booking route must cap page size"
    );
    assert.match(
      route,
      /search\.get\("cursor"\)/,
      "the owned-booking route must pass through the opaque cursor"
    );
    assert.match(
      route,
      /meta:\s*\{\s*nextCursor:/,
      "the owned-booking route must return meta.nextCursor"
    );
  }
}

assert.match(
  contract,
  /SuccessEnvelope:[\s\S]*?required: \[data, requestId\]/,
  "success responses require data and requestId"
);
assert.match(
  contract,
  /ErrorEnvelope:[\s\S]*?required: \[error, requestId\]/,
  "failure responses require error and requestId"
);
assert.match(
  contract,
  /Limit:[\s\S]*?maximum: 50/,
  "the documented page limit must remain capped at 50"
);
assert.match(
  contract,
  /PageMeta:[\s\S]*?required: \[nextCursor\]/,
  "paginated responses expose the next opaque cursor"
);

const bookingBlock = contract.slice(
  contract.indexOf("    Booking:\n"),
  contract.indexOf("    LotteryEntryInput:\n")
);
assert.doesNotMatch(
  bookingBlock,
  /^\s{8}(?:cancelToken|contactValue|email):/m,
  "the Booking response schema must not expose private import/contact fields"
);
assert.doesNotMatch(
  bookingBlock,
  /required: \[[^\]]*(?:cancelToken|contactValue|email)/,
  "private fields cannot be required by Booking"
);

const photoBlock = contract.slice(
  contract.indexOf("    Photo:\n"),
  contract.indexOf("    SearchResult:\n")
);
assert.match(
  photoBlock,
  /required: \[id, width, height, public, caption, comment, urls, credits\]/,
  "Photo requires its absolute URL group"
);
assert.match(
  photoBlock,
  /required: \[thumb, med, full\]/,
  "all three public renditions are required"
);

const reportBlock = contract.slice(
  contract.indexOf("    ContentReport:\n")
);
assert.match(reportBlock, /required: \[id, status, createdAt\]/);
assert.match(reportBlock, /status:\s*\n\s*const: pending/);
assert.match(reportBlock, /createdAt:\s*\n\s*type: string\s*\n\s*format: date-time/);

console.log(
  `miniapp OpenAPI and ${operations.length} route contract checks passed`
);
