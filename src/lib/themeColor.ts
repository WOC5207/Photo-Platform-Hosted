import type { CSSProperties } from "react";

export const DEFAULT_THEME_COLOR = "#a44f25";
export const THEME_COLOR_PATTERN = /^(#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}))?$/;

type ThemeColorProperties = CSSProperties & {
  "--color-accent"?: string;
  "--color-accent-strong"?: string;
  "--color-accent-surface"?: string;
  "--color-accent-fg"?: string;
};

export function normalizeThemeColor(value: string): string | null {
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

function linearChannel(value: number): number {
  const channel = value / 255;
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(color: string): number {
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  return (
    0.2126 * linearChannel(red) +
    0.7152 * linearChannel(green) +
    0.0722 * linearChannel(blue)
  );
}

export function themeColorForeground(value: string): "#211d18" | "#fffefb" {
  const color = normalizeThemeColor(value) ?? DEFAULT_THEME_COLOR;
  const luminance = relativeLuminance(color);
  const dark = "#211d18";
  const light = "#fffefb";
  const contrastWithDark =
    (luminance + 0.05) / (relativeLuminance(dark) + 0.05);
  const contrastWithLight =
    (relativeLuminance(light) + 0.05) / (luminance + 0.05);

  return contrastWithDark >= contrastWithLight ? dark : light;
}

/**
 * Scope a photographer's accent to their public-site wrapper. Strong and
 * surface variants remain theme-aware through color-mix, while foreground
 * contrast is chosen from the stored color's relative luminance.
 */
export function themeColorStyle(value: string): ThemeColorProperties {
  const color = normalizeThemeColor(value);
  if (!color) return {};

  return {
    "--color-accent": color,
    "--color-accent-strong": `color-mix(in srgb, ${color} 82%, var(--color-fg))`,
    "--color-accent-surface": `color-mix(in srgb, ${color} 12%, transparent)`,
    "--color-accent-fg": themeColorForeground(color)
  };
}
