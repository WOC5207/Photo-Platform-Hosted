import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import en from "../messages/en.json";
import {
  applyTextOverrides,
  argumentNames,
  builtInText,
  checkText,
  isEditableKey
} from "../src/lib/textOverrideRules";

// Only menu namespaces can be reworded, and only keys both languages have.
assert.equal(isEditableKey("album3d.menuCosplan"), true);
assert.equal(isEditableKey("album3d.studioCrumbs.site"), true);
assert.equal(isEditableKey("nav.booking"), true);
assert.equal(isEditableKey("auth.invalid"), false);
assert.equal(isEditableKey("album3d.noSuchKey"), false);
assert.equal(isEditableKey("album3d.studioCrumbs"), false, "a group of messages is not one text");
assert.equal(isEditableKey("album3d.__proto__"), false);
assert.equal(isEditableKey(42), false);

assert.deepEqual(argumentNames("{count, plural, =1 {# album} other {# albums}}"), new Set(["count"]));
assert.deepEqual(argumentNames("{used} of {total}"), new Set(["used", "total"]));

// Plain wording, and keeping or dropping the values the page fills in, are fine.
assert.equal(checkText("album3d.menuCosplan", "en", "Make a Cosplan"), null);
assert.equal(checkText("album3d.menuPhotographersSub", "en", "{count} on file"), null);
assert.equal(checkText("album3d.menuPhotographersSub", "en", "Everyone who shoots here"), null);
assert.equal(checkText("album3d.menuPhotographersSub", "zh", "共 {count} 位"), null);
assert.equal(checkText("album3d.menuPhotographersSub", "en", "{count, plural, =1 {one} other {# people}}"), null);
// A value the page doesn't pass, broken brackets, too long, or a key outside the menus are not.
assert.equal(checkText("album3d.menuPhotographersSub", "en", "{total} photographers"), "arguments");
assert.equal(checkText("album3d.menuCosplan", "en", "Hello {name}"), "arguments");
assert.equal(checkText("album3d.menuPhotographersSub", "en", "{count, plural, =1 {# person}"), "syntax");
assert.equal(checkText("album3d.menuCosplan", "en", "x".repeat(121)), "long");
assert.equal(checkText("auth.invalid", "en", "Nope"), "key");

// Overrides land on their key alone; the rest of the messages, and the
// original objects, are untouched; stale keys are skipped.
const messages = { album3d: { menuCosplan: "Create Cosplan", studioCrumbs: { site: "Site" } }, nav: { home: "Home" } };
const merged = applyTextOverrides(messages, [
  { key: "album3d.menuCosplan", value: "Make a Cosplan" },
  { key: "album3d.studioCrumbs.site", value: "My site" },
  { key: "album3d.gone", value: "Nobody reads this" },
  { key: "auth.invalid", value: "Not a menu" }
]);
assert.deepEqual(merged, {
  album3d: { menuCosplan: "Make a Cosplan", studioCrumbs: { site: "My site" } },
  nav: { home: "Home" }
});
assert.equal(messages.album3d.menuCosplan, "Create Cosplan");
assert.equal(messages.album3d.studioCrumbs.site, "Site");
assert.equal(merged.nav, messages.nav, "untouched namespaces are shared, not copied");
assert.equal(applyTextOverrides(messages, []), messages);

// Every key a menu or heading hands to editing mode must be one the server accepts.
const used = new Set<string>();
function scan(dir: string) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) scan(file);
    else if (/\.tsx?$/.test(entry.name)) {
      for (const m of readFileSync(file, "utf8").matchAll(/"((?:album3d|admin|adminSite|nav)\.[\w.]+)"/g)) used.add(m[1]);
    }
  }
}
scan(path.join(process.cwd(), "src/components/album3d"));
for (const page of ["site", "storage", "account"]) used.add(`album3d.studioCrumbs.${page}`);
for (const page of ["site", "account", "posters", "credits"]) used.add(`album3d.studioSub.${page}`);
assert.ok(used.size > 40, `found only ${used.size} keys`);
for (const key of used) assert.ok(isEditableKey(key), `${key} is not editable`);
assert.equal(builtInText("album3d.menuCosplan", "en"), en.album3d.menuCosplan);

console.log(`Text overrides: ${used.size} menu keys editable, rules OK`);
