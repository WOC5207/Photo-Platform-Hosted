import assert from "node:assert/strict";
import {
  normalizeThemeColor,
  themeColorForeground,
  themeColorStyle
} from "../src/lib/themeColor";

assert.equal(normalizeThemeColor(""), null);
assert.equal(normalizeThemeColor("#AbC"), "#aabbcc");
assert.equal(normalizeThemeColor("#12ef90"), "#12ef90");
assert.equal(normalizeThemeColor("red"), null);
assert.equal(normalizeThemeColor("#abcd"), null);

assert.equal(themeColorForeground("#ffffff"), "#211d18");
assert.equal(themeColorForeground("#000000"), "#fffefb");
assert.deepEqual(themeColorStyle("not-a-color"), {});

const style = themeColorStyle("#3b82f6");
assert.equal(style["--color-accent"], "#3b82f6");
assert.equal(style["--color-accent-fg"], "#211d18");
assert.match(String(style["--color-accent-strong"]), /color-mix/);
assert.match(String(style["--color-accent-surface"]), /color-mix/);

console.log("Theme color normalization, derivation and contrast tests passed.");
