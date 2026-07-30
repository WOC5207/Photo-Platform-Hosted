import type { CSSProperties } from "react";

export const DEFAULT_THEME_COLOR = "#a44f25";
export const THEME_COLOR_PATTERN = /^(#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}))?$/;

export const DEFAULT_SITE_PALETTE = {
  backgroundColor: "#f3f0e9",
  surfaceColor: "#fbfaf6",
  fieldColor: "#ece8df",
  textColor: "#211d18",
  themeColor: DEFAULT_THEME_COLOR
} as const;

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
  colors: SiteThemeColors
): EffectiveSitePalette {
  const backgroundColor =
    normalizeThemeColor(colors.backgroundColor) ??
    DEFAULT_SITE_PALETTE.backgroundColor;
  const surfaceColor =
    normalizeThemeColor(colors.surfaceColor) ?? automaticSurface(backgroundColor);
  const fieldColor =
    normalizeThemeColor(colors.fieldColor) ?? automaticField(backgroundColor);
  const backgrounds = [backgroundColor, surfaceColor, fieldColor];
  const textColor =
    normalizeThemeColor(colors.textColor) ?? bestAutomaticText(backgrounds);
  const themeColor =
    normalizeThemeColor(colors.themeColor) ?? DEFAULT_SITE_PALETTE.themeColor;

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

export function siteThemeMinimumContrast(colors: SiteThemeColors): number {
  const palette = effectiveSitePalette(colors);
  return minimumContrast(palette.textColor, [
    palette.backgroundColor,
    palette.surfaceColor,
    palette.fieldColor
  ]);
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

  const palette = effectiveSitePalette(colors);
  style["--color-page"] = palette.backgroundColor;
  style["--color-surface"] = palette.surfaceColor;
  style["--color-surface-2"] =
    `color-mix(in srgb, ${palette.surfaceColor} 90%, ${palette.textColor})`;
  style["--color-raised"] =
    `color-mix(in srgb, ${palette.surfaceColor} 92%, #fffefb)`;
  style["--color-control"] = palette.fieldColor;
  style["--color-fg"] = palette.textColor;
  style["--color-fg-muted"] = palette.mutedTextColor;
  style["--color-fg-subtle"] = palette.subtleTextColor;
  style["--color-fg-faint"] = palette.subtleTextColor;
  style["--color-border"] =
    `color-mix(in srgb, ${palette.textColor} 12%, transparent)`;
  style["--color-border-strong"] =
    `color-mix(in srgb, ${palette.textColor} 24%, transparent)`;

  if (!accent) {
    style["--color-accent"] = palette.themeColor;
    style["--color-accent-strong"] =
      `color-mix(in srgb, ${palette.themeColor} 82%, ${palette.textColor})`;
    style["--color-accent-surface"] =
      `color-mix(in srgb, ${palette.themeColor} 12%, transparent)`;
    style["--color-accent-fg"] = themeColorForeground(palette.themeColor);
  }

  return style;
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
