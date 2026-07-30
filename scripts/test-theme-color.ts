import assert from "node:assert/strict";
import {
  colorContrastRatio,
  effectiveSitePalette,
  normalizeThemeColor,
  siteThemeMinimumContrast,
  siteThemeStyle,
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

const customPalette = {
  backgroundColor: "#111827",
  surfaceColor: "#1f2937",
  fieldColor: "#0f172a",
  textColor: "#f8fafc",
  themeColor: "#f59e0b"
};
const palette = effectiveSitePalette(customPalette);
assert.equal(palette.backgroundColor, "#111827");
assert.equal(palette.surfaceColor, "#1f2937");
assert.equal(palette.fieldColor, "#0f172a");
assert.equal(palette.textColor, "#f8fafc");
assert.ok(siteThemeMinimumContrast(customPalette) >= 4.5);
assert.ok(colorContrastRatio(palette.textColor, palette.fieldColor) >= 4.5);

const paletteStyle = siteThemeStyle(customPalette);
assert.equal(paletteStyle["--color-page"], "#111827");
assert.equal(paletteStyle["--color-surface"], "#1f2937");
assert.equal(paletteStyle["--color-control"], "#0f172a");
assert.equal(paletteStyle["--color-fg"], "#f8fafc");
assert.equal(paletteStyle["--color-accent"], "#f59e0b");
assert.equal(paletteStyle["--color-accent-fg"], "#211d18");

const automaticPalette = effectiveSitePalette({
  backgroundColor: "#101010",
  surfaceColor: "",
  fieldColor: "",
  textColor: "",
  themeColor: ""
});
assert.equal(automaticPalette.textColor, "#fffefb");
assert.ok(
  siteThemeMinimumContrast({
    backgroundColor: "#101010",
    surfaceColor: "",
    fieldColor: "",
    textColor: "",
    themeColor: ""
  }) >= 4.5
);
assert.ok(
  siteThemeMinimumContrast({
    backgroundColor: "#ffffff",
    surfaceColor: "#ffffff",
    fieldColor: "#ffffff",
    textColor: "#fefefe",
    themeColor: ""
  }) < 4.5
);

console.log("Theme color normalization, derivation and contrast tests passed.");
