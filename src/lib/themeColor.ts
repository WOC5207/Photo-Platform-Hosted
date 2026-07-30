import type { CSSProperties } from "react";

export const DEFAULT_THEME_COLOR = "#a44f25";
export const THEME_COLOR_PATTERN = /^(#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}))?$/;
export const SITE_BACKGROUND_SCRIM_OPACITY = 0.65;
export const GENERATED_PALETTE_TEXT_CONTRAST = 7;

export const DEFAULT_SITE_PALETTE = {
  backgroundColor: "#f3f0e9",
  surfaceColor: "#fbfaf6",
  fieldColor: "#ece8df",
  textColor: "#211d18",
  themeColor: DEFAULT_THEME_COLOR
} as const;

export const DEFAULT_SITE_DARK_PALETTE = {
  backgroundColor: "#100f0d",
  surfaceColor: "#181613",
  fieldColor: "#0c0b0a",
  textColor: "#f1ece4",
  themeColor: "#e29a68"
} as const;

export type SiteThemeMode = "light" | "dark";

export type SiteThemeColors = {
  backgroundColor: string;
  surfaceColor: string;
  fieldColor: string;
  textColor: string;
  themeColor: string;
};

export type EffectiveSitePalette = {
  backgroundColor: string;
  surfaceColor: string;
  fieldColor: string;
  textColor: string;
  mutedTextColor: string;
  subtleTextColor: string;
  themeColor: string;
};

type SiteThemeProperties = CSSProperties & {
  "--color-page"?: string;
  "--color-surface"?: string;
  "--color-surface-2"?: string;
  "--color-raised"?: string;
  "--color-control"?: string;
  "--color-fg"?: string;
  "--color-fg-muted"?: string;
  "--color-fg-subtle"?: string;
  "--color-fg-faint"?: string;
  "--color-border"?: string;
  "--color-border-strong"?: string;
  "--color-accent"?: string;
  "--color-accent-strong"?: string;
  "--color-accent-surface"?: string;
  "--color-accent-fg"?: string;
};

type SiteDualThemeProperties = CSSProperties & {
  [key: `--site-${SiteThemeMode}-${string}`]: string;
};

export function normalizeThemeColor(value?: string | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || !THEME_COLOR_PATTERN.test(trimmed)) return null;

  const hex = trimmed.slice(1);
  if (hex.length === 3) {
    return `#${hex
      .split("")
      .map((character) => character.repeat(2))
      .join("")}`.toLowerCase();
  }
  return `#${hex.toLowerCase()}`;
}

function hexChannels(color: string): [number, number, number] {
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16)
  ];
}

function channelsToHex(channels: [number, number, number]): string {
  return `#${channels
    .map((channel) =>
      Math.round(Math.max(0, Math.min(255, channel)))
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;
}

function mixHex(foreground: string, background: string, weight: number): string {
  const fg = hexChannels(foreground);
  const bg = hexChannels(background);
  return channelsToHex([
    fg[0] * weight + bg[0] * (1 - weight),
    fg[1] * weight + bg[1] * (1 - weight),
    fg[2] * weight + bg[2] * (1 - weight)
  ]);
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const normalizedHue = ((hue % 360) + 360) % 360 / 360;
  const clampedSaturation = Math.max(0, Math.min(1, saturation));
  const clampedLightness = Math.max(0, Math.min(1, lightness));

  if (clampedSaturation === 0) {
    const channel = clampedLightness * 255;
    return channelsToHex([channel, channel, channel]);
  }

  const hueChannel = (p: number, q: number, value: number) => {
    let channel = value;
    if (channel < 0) channel += 1;
    if (channel > 1) channel -= 1;
    if (channel < 1 / 6) return p + (q - p) * 6 * channel;
    if (channel < 1 / 2) return q;
    if (channel < 2 / 3) return p + (q - p) * (2 / 3 - channel) * 6;
    return p;
  };
  const q =
    clampedLightness < 0.5
      ? clampedLightness * (1 + clampedSaturation)
      : clampedLightness +
        clampedSaturation -
        clampedLightness * clampedSaturation;
  const p = 2 * clampedLightness - q;

  return channelsToHex([
    hueChannel(p, q, normalizedHue + 1 / 3) * 255,
    hueChannel(p, q, normalizedHue) * 255,
    hueChannel(p, q, normalizedHue - 1 / 3) * 255
  ]);
}

function linearChannel(value: number): number {
  const channel = value / 255;
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(color: string): number {
  const [red, green, blue] = hexChannels(color);
  return (
    0.2126 * linearChannel(red) +
    0.7152 * linearChannel(green) +
    0.0722 * linearChannel(blue)
  );
}

export function colorContrastRatio(first: string, second: string): number {
  const firstColor = normalizeThemeColor(first);
  const secondColor = normalizeThemeColor(second);
  if (!firstColor || !secondColor) return 0;
  const firstLuminance = relativeLuminance(firstColor);
  const secondLuminance = relativeLuminance(secondColor);
  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05)
  );
}

function minimumContrast(text: string, backgrounds: string[]): number {
  return Math.min(
    ...backgrounds.map((background) => colorContrastRatio(text, background))
  );
}

function bestAutomaticText(backgrounds: string[]): "#211d18" | "#fffefb" {
  const dark = "#211d18";
  const light = "#fffefb";
  return minimumContrast(dark, backgrounds) >= minimumContrast(light, backgrounds)
    ? dark
    : light;
}

function safeRandomUnit(random: () => number): number {
  const value = random();
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(0.999999999, value));
}

function photoScrimBackgrounds(page: string): string[] {
  return [
    mixHex(page, "#000000", SITE_BACKGROUND_SCRIM_OPACITY),
    mixHex(page, "#ffffff", SITE_BACKGROUND_SCRIM_OPACITY)
  ];
}

/**
 * Creates a restrained, coordinated public-site palette instead of choosing
 * each semantic role independently. Generated text targets WCAG AAA against
 * every solid surface; the accent also maintains non-text contrast against
 * those surfaces and readable button text.
 */
export function generateAccessibleSitePalette(
  mode: SiteThemeMode = "light",
  random: () => number = Math.random
): SiteThemeColors {
  const dark = mode === "dark";
  const hue = safeRandomUnit(random) * 360;
  const surfaceSaturation =
    (dark ? 0.08 : 0.12) + safeRandomUnit(random) * (dark ? 0.12 : 0.16);
  const pageLightness =
    (dark ? 0.055 : 0.92) + safeRandomUnit(random) * (dark ? 0.04 : 0.04);
  const backgroundColor = hslToHex(
    hue,
    surfaceSaturation,
    pageLightness
  );
  const surfaceColor = hslToHex(
    hue,
    surfaceSaturation * 0.78,
    dark ? pageLightness + 0.06 : Math.min(0.985, pageLightness + 0.035)
  );
  const fieldColor = hslToHex(
    hue,
    surfaceSaturation * 0.62,
    dark ? Math.max(0.025, pageLightness - 0.025) : pageLightness - 0.055
  );
  const backgrounds = [backgroundColor, surfaceColor, fieldColor];
  const textColor = bestAutomaticText(backgrounds);

  const rotations = [-30, 0, 30, 150, 180] as const;
  const rotation =
    rotations[Math.floor(safeRandomUnit(random) * rotations.length)];
  const accentHue = hue + rotation;
  const accentSaturation = 0.55 + safeRandomUnit(random) * 0.2;
  let themeColor = dark ? "#e29a68" : "#7c3718";

  for (let attempt = 0; attempt < 36; attempt += 1) {
    const lightness = dark
      ? Math.min(0.82, 0.58 + attempt * 0.007)
      : Math.max(0.2, 0.44 - attempt * 0.007);
    const candidate = hslToHex(accentHue, accentSaturation, lightness);
    const accentForeground = themeColorForeground(candidate);
    if (
      minimumContrast(candidate, backgrounds) >= 3 &&
      colorContrastRatio(candidate, accentForeground) >= 4.5
    ) {
      themeColor = candidate;
      break;
    }
  }

  const palette = {
    backgroundColor,
    surfaceColor,
    fieldColor,
    textColor,
    themeColor
  };

  // The ranges above are deliberately conservative, but keep a deterministic
  // contact-sheet fallback if future tuning ever violates either guarantee.
  if (
    siteThemeMinimumContrast(palette, mode) <
      GENERATED_PALETTE_TEXT_CONTRAST ||
    siteThemeMinimumPhotoScrimContrast(palette, mode) < 4.5
  ) {
    return {
      ...(dark ? DEFAULT_SITE_DARK_PALETTE : DEFAULT_SITE_PALETTE)
    };
  }

  return palette;
}

function readableTextTone(
  text: string,
  page: string,
  backgrounds: string[],
  target: number
): string {
  if (minimumContrast(text, backgrounds) < target) return text;

  let readable = text;
  for (let textWeight = 0.98; textWeight >= 0.4; textWeight -= 0.02) {
    const candidate = mixHex(text, page, textWeight);
    if (minimumContrast(candidate, backgrounds) < target) break;
    readable = candidate;
  }
  return readable;
}

function automaticSurface(page: string): string {
  const text = bestAutomaticText([page]);
  return text === "#211d18"
    ? mixHex("#fffefb", page, 0.42)
    : mixHex("#fffefb", page, 0.07);
}

function automaticField(page: string): string {
  const text = bestAutomaticText([page]);
  return text === "#211d18"
    ? mixHex("#211d18", page, 0.06)
    : mixHex("#000000", page, 0.16);
}

export function themeColorForeground(value: string): "#211d18" | "#fffefb" {
  const color = normalizeThemeColor(value) ?? DEFAULT_THEME_COLOR;
  return bestAutomaticText([color]);
}

export function hasCustomSitePalette(colors: SiteThemeColors): boolean {
  return Boolean(
    normalizeThemeColor(colors.backgroundColor) ||
      normalizeThemeColor(colors.surfaceColor) ||
      normalizeThemeColor(colors.fieldColor) ||
      normalizeThemeColor(colors.textColor)
  );
}

export function effectiveSitePalette(
  colors: SiteThemeColors,
  mode: SiteThemeMode = "light"
): EffectiveSitePalette {
  const defaults =
    mode === "dark" ? DEFAULT_SITE_DARK_PALETTE : DEFAULT_SITE_PALETTE;
  const hasCustomSurfaces = hasCustomSitePalette(colors);
  const backgroundColor = hasCustomSurfaces
    ? (normalizeThemeColor(colors.backgroundColor) ?? defaults.backgroundColor)
    : defaults.backgroundColor;
  const surfaceColor = hasCustomSurfaces
    ? (normalizeThemeColor(colors.surfaceColor) ??
      automaticSurface(backgroundColor))
    : defaults.surfaceColor;
  const fieldColor = hasCustomSurfaces
    ? (normalizeThemeColor(colors.fieldColor) ?? automaticField(backgroundColor))
    : defaults.fieldColor;
  const backgrounds = [backgroundColor, surfaceColor, fieldColor];
  const textColor = hasCustomSurfaces
    ? (normalizeThemeColor(colors.textColor) ?? bestAutomaticText(backgrounds))
    : defaults.textColor;
  const themeColor =
    normalizeThemeColor(colors.themeColor) ?? defaults.themeColor;

  return {
    backgroundColor,
    surfaceColor,
    fieldColor,
    textColor,
    mutedTextColor: readableTextTone(
      textColor,
      backgroundColor,
      backgrounds,
      5.5
    ),
    subtleTextColor: readableTextTone(
      textColor,
      backgroundColor,
      backgrounds,
      4.5
    ),
    themeColor
  };
}

export function siteThemeMinimumContrast(
  colors: SiteThemeColors,
  mode: SiteThemeMode = "light"
): number {
  const palette = effectiveSitePalette(colors, mode);
  return minimumContrast(palette.textColor, [
    palette.backgroundColor,
    palette.surfaceColor,
    palette.fieldColor
  ]);
}

export function siteThemeMinimumPhotoScrimContrast(
  colors: SiteThemeColors,
  mode: SiteThemeMode = "light"
): number {
  const palette = effectiveSitePalette(colors, mode);
  return minimumContrast(
    palette.textColor,
    photoScrimBackgrounds(palette.backgroundColor)
  );
}

function effectivePaletteStyle(
  palette: EffectiveSitePalette
): SiteThemeProperties {
  return {
    "--color-page": palette.backgroundColor,
    "--color-surface": palette.surfaceColor,
    "--color-surface-2":
      `color-mix(in srgb, ${palette.surfaceColor} 90%, ${palette.textColor})`,
    "--color-raised":
      `color-mix(in srgb, ${palette.surfaceColor} 92%, #fffefb)`,
    "--color-control": palette.fieldColor,
    "--color-fg": palette.textColor,
    "--color-fg-muted": palette.mutedTextColor,
    "--color-fg-subtle": palette.subtleTextColor,
    "--color-fg-faint": palette.subtleTextColor,
    "--color-border":
      `color-mix(in srgb, ${palette.textColor} 12%, transparent)`,
    "--color-border-strong":
      `color-mix(in srgb, ${palette.textColor} 24%, transparent)`,
    "--color-accent": palette.themeColor,
    "--color-accent-strong":
      `color-mix(in srgb, ${palette.themeColor} 82%, ${palette.textColor})`,
    "--color-accent-surface":
      `color-mix(in srgb, ${palette.themeColor} 12%, transparent)`,
    "--color-accent-fg": themeColorForeground(palette.themeColor)
  };
}

/** Full semantic-token style for a fixed light or dark palette preview. */
export function sitePaletteStyle(
  colors: SiteThemeColors,
  mode: SiteThemeMode
): SiteThemeProperties {
  return effectivePaletteStyle(effectiveSitePalette(colors, mode));
}

/**
 * Supplies both public-site palettes without overriding the active semantic
 * tokens directly. The `.site-dual-theme` CSS scope chooses the light or dark
 * namespace from the visitor's explicit/system theme.
 */
export function siteDualThemeStyle(
  light: SiteThemeColors,
  dark: SiteThemeColors
): SiteDualThemeProperties {
  const style: SiteDualThemeProperties = {};

  for (const [mode, palette] of [
    ["light", light],
    ["dark", dark]
  ] as const) {
    for (const [property, value] of Object.entries(
      sitePaletteStyle(palette, mode)
    )) {
      style[`--site-${mode}-${property.slice(2)}`] = value;
    }
  }

  return style;
}

/**
 * Scope a photographer's complete palette to their public-site wrapper.
 * Empty surface/text values retain the platform theme until one of those
 * values is customized; at that point, a coherent fixed palette is derived
 * from the saved canvas color. Button foreground is always chosen
 * automatically for contrast.
 */
export function siteThemeStyle(colors: SiteThemeColors): SiteThemeProperties {
  const style: SiteThemeProperties = {};
  const accent = normalizeThemeColor(colors.themeColor);

  if (accent) {
    style["--color-accent"] = accent;
    style["--color-accent-strong"] =
      `color-mix(in srgb, ${accent} 82%, var(--color-fg))`;
    style["--color-accent-surface"] =
      `color-mix(in srgb, ${accent} 12%, transparent)`;
    style["--color-accent-fg"] = themeColorForeground(accent);
  }

  if (!hasCustomSitePalette(colors)) return style;

  return {
    ...style,
    ...effectivePaletteStyle(effectiveSitePalette(colors))
  };
}

/** Backwards-compatible accent-only helper for callers and tests. */
export function themeColorStyle(value: string): SiteThemeProperties {
  return siteThemeStyle({
    backgroundColor: "",
    surfaceColor: "",
    fieldColor: "",
    textColor: "",
    themeColor: value
  });
}
