import assert from "node:assert/strict";
import {
  classicTwin,
  parentScreen,
  parseScreen,
  screenPath,
  siteModeCookie,
  threeDTwin
} from "../src/lib/siteMode";

// Every 3D screen parses from its own address and prints it back.
const screens = [
  "/3d",
  "/3d/albums",
  "/3d/photographers",
  "/3d/settings",
  "/3d/u/george",
  "/3d/u/george/albums",
  "/3d/u/george/albums/fan-expo-2026",
  "/3d/u/george/albums/fan-expo-2026/360",
  "/3d/u/george/albums/fan-expo-2026/photos",
  "/3d/u/george/albums/fan-expo-2026/photos/cmabc123"
];
for (const path of screens) {
  const screen = parseScreen(path);
  assert.ok(screen, `${path} parses`);
  assert.equal(screenPath(screen), path, `${path} round-trips`);
}

assert.deepEqual(parseScreen("/3d/u/george/albums/fan-expo-2026?x=1"), {
  kind: "album",
  username: "george",
  slug: "fan-expo-2026",
  study: false
});
for (const path of ["/", "/u/george", "/3d/u", "/3d/u/george/booking", "/3d/u/george/albums/a/b", "/3d/u/george/albums/a/photos/b/c", "/3d/nope"]) {
  assert.equal(parseScreen(path), null, `${path} is not a 3D screen`);
}

// Esc walks back up the tree to the title screen.
const climb = (path: string) => {
  let screen = parseScreen(path);
  const trail: string[] = [];
  while (screen) {
    trail.push(screenPath(screen));
    screen = parentScreen(screen);
  }
  return trail;
};
assert.deepEqual(climb("/3d/u/george/albums/fan-expo-2026/360").slice(0, 2), [
  "/3d/u/george/albums/fan-expo-2026/360",
  "/3d/u/george/albums/fan-expo-2026"
]);
assert.deepEqual(climb("/3d/settings"), ["/3d/settings", "/3d"]);
assert.deepEqual(climb("/3d/u/george/albums/fan-expo-2026/photos/cmabc123"), [
  "/3d/u/george/albums/fan-expo-2026/photos/cmabc123",
  "/3d/u/george/albums/fan-expo-2026/photos",
  "/3d/u/george/albums/fan-expo-2026",
  "/3d/u/george/albums",
  "/3d/u/george",
  "/3d/photographers",
  "/3d"
]);

// The switch lands on the matching page on the other side.
const twins: [classic: string, threeD: string][] = [
  ["/u/george", "/3d/u/george"],
  ["/u/george/gallery", "/3d/u/george/albums"],
  ["/u/george/gallery/fan-expo-2026", "/3d/u/george/albums/fan-expo-2026"],
  ["/u/george/gallery/fan-expo-2026?photo=cmabc123", "/3d/u/george/albums/fan-expo-2026/photos/cmabc123"]
];
for (const [classic, threeD] of twins) {
  assert.equal(threeDTwin(classic), threeD, `${classic} -> 3D`);
  assert.equal(classicTwin(threeD), classic, `${threeD} -> classic`);
}
assert.equal(threeDTwin("/"), "/3d");
assert.equal(threeDTwin("/cosplan"), "/3d");
assert.equal(threeDTwin("/u/george/booking"), "/3d/u/george");
assert.equal(classicTwin("/3d"), "/");
assert.equal(classicTwin("/3d/albums"), "/");
assert.equal(classicTwin("/3d/settings"), "/");
assert.equal(classicTwin("/3d/u/george/albums/fan-expo-2026/photos"), "/u/george/gallery/fan-expo-2026");
assert.equal(classicTwin("/3d/u/george/albums/fan-expo-2026/360"), "/u/george/gallery/fan-expo-2026");
assert.equal(classicTwin("/somewhere"), "/");

// Usernames and slugs that need escaping survive the trip.
assert.equal(threeDTwin("/u/a%20b/gallery/c%2Fd"), "/3d/u/a%20b/albums/c%2Fd");
assert.equal(classicTwin("/3d/u/a%20b/albums/c%2Fd"), "/u/a%20b/gallery/c%2Fd");

assert.match(siteModeCookie("3d"), /^site_mode=3d; Path=\/; Max-Age=\d+; SameSite=Lax$/);

console.log("Site mode routing tests passed.");
