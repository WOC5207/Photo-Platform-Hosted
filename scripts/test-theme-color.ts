import assert from "node:assert/strict";
import {
  colorContrastRatio,
  effectiveSitePalette,
  GENERATED_PALETTE_TEXT_CONTRAST,
  generateAccessibleSitePalette,
  normalizeThemeColor,
  siteThemeMinimumPhotoScrimContrast,
  siteThemeMinimumContrast,
  siteDualThemeStyle,
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

const emptyPalette = {
  backgroundColor: "",
  surfaceColor: "",
  fieldColor: "",
  textColor: "",
  themeColor: ""
};
const darkDefault = effectiveSitePalette(emptyPalette, "dark");
assert.equal(darkDefault.backgroundColor, "#100f0d");
assert.equal(darkDefault.textColor, "#f1ece4");

const dualStyle = siteDualThemeStyle(emptyPalette, emptyPalette);
assert.equal(dualStyle["--site-light-color-page"], "#f3f0e9");
assert.equal(dualStyle["--site-dark-color-page"], "#100f0d");
assert.equal(dualStyle["--site-light-color-accent"], "#a44f25");
assert.equal(dualStyle["--site-dark-color-accent"], "#e29a68");

let randomState = 0x9e3779b9;
const seededRandom = () => {
  randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
  return randomState / 0x100000000;
};

for (const mode of ["light", "dark"] as const) {
  for (let index = 0; index < 1_000; index += 1) {
    const generated = generateAccessibleSitePalette(mode, seededRandom);
    const generatedEffective = effectiveSitePalette(generated, mode);
    const backgrounds = [
      generatedEffective.backgroundColor,
      generatedEffective.surfaceColor,
      generatedEffective.fieldColor
    ];

    assert.equal(
      generatedEffective.textColor,
      mode === "dark" ? "#fffefb" : "#211d18"
    );
    assert.ok(
      siteThemeMinimumContrast(generated, mode) >=
        GENERATED_PALETTE_TEXT_CONTRAST,
      `Generated ${mode} palette ${index} missed the text target`
    );
    assert.ok(
      siteThemeMinimumPhotoScrimContrast(generated, mode) >= 4.5,
      `Generated ${mode} palette ${index} was unsafe over the background scrim`
    );
    assert.ok(
      colorContrastRatio(
        generatedEffective.themeColor,
        themeColorForeground(generatedEffective.themeColor)
      ) >= 4.5,
      `Generated ${mode} palette ${index} produced unreadable button text`
    );
    assert.ok(
      backgrounds.every(
        (background) =>
          colorContrastRatio(generatedEffective.themeColor, background) >= 3
      ),
      `Generated ${mode} palette ${index} produced an indistinct accent`
    );
  }
}

console.log("Theme color normalization, derivation and contrast tests passed.");
