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
  "/3d/login",
  "/3d/cosplan",
  "/3d/cosplan/board",
  "/3d/cosplan/print",
  "/3d/sharepost",
  "/3d/sharepost/layout",
  "/3d/sharepost/credits",
  "/3d/sharepost/print",
  "/3d/u/george",
  "/3d/u/george/albums",
  "/3d/u/george/albums/fan-expo-2026",
  "/3d/u/george/albums/fan-expo-2026/360",
  "/3d/u/george/albums/fan-expo-2026/photos",
  "/3d/u/george/albums/fan-expo-2026/photos/cmabc123",
  "/3d/u/george/booking",
  "/3d/u/george/book/k3x9q2",
  "/3d/u/george/draw/p8z4m1",
  "/3d/u/george/studio",
  "/3d/u/george/studio/events",
  "/3d/u/george/studio/events/new",
  "/3d/u/george/studio/events/cmevent1",
  "/3d/u/george/studio/events/cmevent1/photos",
  "/3d/u/george/studio/events/cmevent1/upload",
  "/3d/u/george/studio/bookings",
  "/3d/u/george/studio/bookings/cmbook1",
  "/3d/u/george/studio/bookings/cmbook1/details",
  "/3d/u/george/studio/bookings/cmbook1/lottery"
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
for (const path of ["/", "/u/george", "/3d/u", "/3d/u/george/bookings", "/3d/u/george/book", "/3d/u/george/book/Not-A-Token", "/3d/u/george/draw/a/b", "/3d/u/george/albums/a/b", "/3d/u/george/albums/a/photos/b/c", "/3d/nope", "/3d/cosplan/x", "/3d/cosplan/board/x", "/3d/sharepost/board", "/3d/sharing-poster", "/3d/u/george/studio/booking", "/3d/u/george/studio/bookings/new/x", "/3d/u/george/studio/bookings/cmbook1/constructor", "/3d/u/george/studio/bookings/cmbook1/lottery/x", "/3d/u/george/studio/events/cmevent1/setup", "/3d/u/george/studio/events/cmevent1/photos/x"]) {
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

assert.deepEqual(climb("/3d/u/george/book/k3x9q2"), [
  "/3d/u/george/book/k3x9q2",
  "/3d/u/george/booking",
  "/3d/u/george",
  "/3d/photographers",
  "/3d"
]);
assert.deepEqual(climb("/3d/u/george/draw/p8z4m1").slice(0, 2), ["/3d/u/george/draw/p8z4m1", "/3d/u/george/booking"]);

// The Dashboard walks back to its menu, then the title screen.
assert.deepEqual(climb("/3d/u/george/studio/events/cmevent1/upload"), [
  "/3d/u/george/studio/events/cmevent1/upload",
  "/3d/u/george/studio/events/cmevent1",
  "/3d/u/george/studio/events",
  "/3d/u/george/studio",
  "/3d"
]);
assert.deepEqual(climb("/3d/u/george/studio/bookings/cmbook1/lottery"), [
  "/3d/u/george/studio/bookings/cmbook1/lottery",
  "/3d/u/george/studio/bookings/cmbook1",
  "/3d/u/george/studio/bookings",
  "/3d/u/george/studio",
  "/3d"
]);
assert.deepEqual(climb("/3d/u/george/studio/bookings/cmbook1/details")[1], "/3d/u/george/studio/bookings/cmbook1");
assert.deepEqual(climb("/3d/u/george/studio/events/new").slice(0, 2), ["/3d/u/george/studio/events/new", "/3d/u/george/studio/events"]);
assert.deepEqual(climb("/3d/u/george/studio/events/cmevent1/photos")[1], "/3d/u/george/studio/events/cmevent1");

// The switch lands on the matching page on the other side.
const twins: [classic: string, threeD: string][] = [
  ["/u/george", "/3d/u/george"],
  ["/u/george/gallery", "/3d/u/george/albums"],
  ["/u/george/gallery/fan-expo-2026", "/3d/u/george/albums/fan-expo-2026"],
  ["/u/george/gallery/fan-expo-2026?photo=cmabc123", "/3d/u/george/albums/fan-expo-2026/photos/cmabc123"],
  ["/u/george/booking", "/3d/u/george/booking"],
  ["/cosplan", "/3d/cosplan"],
  ["/sharing-poster", "/3d/sharepost"]
];
for (const [classic, threeD] of twins) {
  assert.equal(threeDTwin(classic), threeD, `${classic} -> 3D`);
  assert.equal(classicTwin(threeD), classic, `${threeD} -> classic`);
}
assert.equal(threeDTwin("/"), "/3d");
assert.equal(threeDTwin("/cosplan/extra"), "/3d");
assert.deepEqual(parentScreen({ kind: "cosplan" }), { kind: "title" });
assert.deepEqual(parentScreen({ kind: "sharepost" }), { kind: "title" });
assert.deepEqual(parentScreen({ kind: "cosplan", step: "board" }), { kind: "cosplan" });
assert.deepEqual(parentScreen({ kind: "cosplan", step: "print" }), { kind: "cosplan", step: "board" });
// The photographer login has a 3D twin of the classic one.
assert.deepEqual(parseScreen("/3d/login"), { kind: "login" });
assert.equal(screenPath({ kind: "login" }), "/3d/login");
assert.deepEqual(parentScreen({ kind: "login" }), { kind: "title" });
assert.equal(classicTwin("/3d/login"), "/login");
assert.equal(threeDTwin("/login"), "/3d/login");
// Sharepost steps go back one at a time.
assert.deepEqual(parentScreen({ kind: "sharepost", step: "layout" }), { kind: "sharepost" });
assert.deepEqual(parentScreen({ kind: "sharepost", step: "credits" }), { kind: "sharepost", step: "layout" });
assert.deepEqual(parentScreen({ kind: "sharepost", step: "print" }), { kind: "sharepost", step: "credits" });
// Every creator step's classic twin is its editor, where the same draft opens.
assert.equal(classicTwin("/3d/cosplan/board"), "/cosplan");
assert.equal(classicTwin("/3d/sharepost/credits"), "/sharing-poster");
// Booking and draw links carry no username; /3d/book and /3d/draw forward.
assert.equal(threeDTwin("/book/k3x9q2"), "/3d/book/k3x9q2");
assert.equal(threeDTwin("/draw/p8z4m1"), "/3d/draw/p8z4m1");
assert.equal(threeDTwin("/book/k3x9q2/check"), "/3d");
assert.equal(threeDTwin("/u/george/settings"), "/3d/u/george");
assert.equal(classicTwin("/3d/u/george/book/k3x9q2"), "/book/k3x9q2");
assert.equal(classicTwin("/3d/u/george/draw/p8z4m1"), "/draw/p8z4m1");
assert.equal(classicTwin("/3d"), "/");
assert.equal(classicTwin("/3d/albums"), "/");
assert.equal(classicTwin("/3d/settings"), "/");
assert.equal(classicTwin("/3d/u/george/albums/fan-expo-2026/photos"), "/u/george/gallery/fan-expo-2026");
assert.equal(classicTwin("/3d/u/george/albums/fan-expo-2026/360"), "/u/george/gallery/fan-expo-2026");
assert.equal(classicTwin("/somewhere"), "/");

// Each Dashboard page has a classic twin; the classic dashboard names no one,
// so its 3D twin goes through /3d/studio, which forwards to the signed-in account.
const dashboardTwins: [threeD: string, classic: string, back: string][] = [
  ["/3d/u/george/studio", "/dashboard", "/3d/studio"],
  ["/3d/u/george/studio/events", "/dashboard/events", "/3d/studio/events"],
  ["/3d/u/george/studio/events/new", "/dashboard/events/new", "/3d/studio/events/new"],
  ["/3d/u/george/studio/events/cmevent1", "/dashboard/events/cmevent1", "/3d/studio/events/cmevent1"],
  ["/3d/u/george/studio/events/cmevent1/photos", "/dashboard/events/cmevent1", "/3d/studio/events/cmevent1"],
  ["/3d/u/george/studio/events/cmevent1/upload", "/dashboard/events/cmevent1/photos", "/3d/studio/events/cmevent1/upload"],
  ["/3d/u/george/studio/bookings", "/dashboard/bookings", "/3d/studio/bookings"],
  ["/3d/u/george/studio/bookings/cmbook1", "/dashboard/bookings/cmbook1", "/3d/studio/bookings/cmbook1"],
  ["/3d/u/george/studio/bookings/cmbook1/details", "/dashboard/bookings/cmbook1?section=overview", "/3d/studio/bookings/cmbook1/details"],
  ["/3d/u/george/studio/bookings/cmbook1/lottery", "/dashboard/bookings/cmbook1/lottery", "/3d/studio/bookings/cmbook1/lottery"]
];
for (const [threeD, classic, back] of dashboardTwins) {
  assert.equal(classicTwin(threeD), classic, `${threeD} -> classic`);
  assert.equal(threeDTwin(classic), back, `${classic} -> 3D`);
}
assert.equal(threeDTwin("/dashboard/events/cmevent1#photos"), "/3d/studio/events/cmevent1/photos");
assert.equal(threeDTwin("/dashboard/bookings/abc?section=advanced"), "/3d/studio/bookings/abc/details");
assert.equal(threeDTwin("/dashboard/bookings/abc?section=schedule"), "/3d/studio/bookings/abc");
assert.equal(threeDTwin("/dashboard/bookings/new"), "/3d/studio/events/new");
assert.equal(threeDTwin("/dashboard/equipment"), "/3d/studio");
assert.equal(threeDTwin("/dashboard/events/cmevent1/setup"), "/3d/studio/events/cmevent1");

// Usernames and slugs that need escaping survive the trip.
assert.equal(threeDTwin("/u/a%20b/gallery/c%2Fd"), "/3d/u/a%20b/albums/c%2Fd");
assert.equal(classicTwin("/3d/u/a%20b/albums/c%2Fd"), "/u/a%20b/gallery/c%2Fd");

assert.match(siteModeCookie("3d"), /^site_mode=3d; Path=\/; Max-Age=\d+; SameSite=Lax$/);

console.log("Site mode routing tests passed.");
