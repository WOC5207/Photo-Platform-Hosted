"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import Button from "@/components/ui/Button";
import {
  effectiveSitePalette,
  GENERATED_PALETTE_TEXT_CONTRAST,
  normalizeThemeColor,
  sitePaletteStyle,
  type SiteThemeColors,
  type SiteThemeMode
} from "@/lib/themeColor";

/**
 * The palette editing pieces shared by a photographer's site settings and the
 * platform admin's public theme. Each form keeps its own state (dirty
 * tracking, undo); these only draw it.
 */

export const EMPTY_SITE_PALETTE: SiteThemeColors = {
  backgroundColor: "",
  surfaceColor: "",
  fieldColor: "",
  textColor: "",
  themeColor: ""
};

export function paletteHasInvalidValue(palette: SiteThemeColors): boolean {
  return Object.values(palette).some(
    (value) => value.trim() && !normalizeThemeColor(value)
  );
}

export function PaletteModeSwitch({
  mode,
  onChange
}: {
  mode: SiteThemeMode;
  onChange: (mode: SiteThemeMode) => void;
}) {
  const t = useTranslations("adminSite");
  return (
    <div
      role="group"
      aria-label={t("paletteModeLabel")}
      className="grid w-full grid-cols-2 rounded-lg border border-border bg-control p-1 sm:w-auto"
    >
      {(["light", "dark"] as const).map((option) => {
        const selected = mode === option;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option)}
            className={`min-h-10 rounded-md px-4 text-sm font-semibold transition-[background-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
              selected
                ? "bg-raised text-fg shadow-[0_0_0_1px_var(--color-border)]"
                : "text-fg-subtle hover:text-fg"
            }`}
          >
            {option === "light"
              ? t("paletteModeLight")
              : t("paletteModeDark")}
          </button>
        );
      })}
    </div>
  );
}

function PaletteColorField({
  label,
  hint,
  hexLabel,
  resetLabel,
  value,
  defaultValue,
  onChange
}: {
  label: string;
  hint: string;
  hexLabel: string;
  resetLabel: string;
  value: string;
  defaultValue: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3 rounded-lg border border-border bg-surface p-3">
      <input
        type="color"
        aria-label={label}
        value={normalizeThemeColor(value) || defaultValue}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-14 cursor-pointer rounded-lg border border-border-strong bg-control p-1"
      />
      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-fg">{label}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-fg-subtle">
              {hint}
            </p>
          </div>
          {value && (
            <Button
              type="button"
              size="compact"
              variant="ghost"
              onClick={() => onChange("")}
            >
              {resetLabel}
            </Button>
          )}
        </div>
        <input
          type="text"
          aria-label={hexLabel}
          value={value}
          placeholder={defaultValue}
          maxLength={7}
          spellCheck={false}
          onChange={(event) => onChange(event.target.value)}
          className="font-meta mt-2 h-10 w-full rounded-lg border border-border-strong bg-control px-3 text-xs text-fg outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
        />
      </div>
    </div>
  );
}

/** The five colour fields plus generate / undo / reset for one mode. */
export function PaletteFieldEditor({
  mode,
  palette,
  defaults,
  onColorChange,
  onGenerate,
  onUndoGenerate,
  onReset
}: {
  mode: SiteThemeMode;
  palette: SiteThemeColors;
  defaults: SiteThemeColors;
  onColorChange: (name: keyof SiteThemeColors, value: string) => void;
  onGenerate: () => void;
  /** Omit when there is no generated palette to undo. */
  onUndoGenerate?: () => void;
  onReset: () => void;
}) {
  const t = useTranslations("adminSite");
  const fields: Array<{
    name: keyof SiteThemeColors;
    label: string;
    hint: string;
    hexLabel: string;
  }> = [
    {
      name: "backgroundColor",
      label: t("backgroundColorSection"),
      hint: t("backgroundColorHint"),
      hexLabel: t("backgroundColorHexLabel")
    },
    {
      name: "surfaceColor",
      label: t("surfaceColorSection"),
      hint: t("surfaceColorHint"),
      hexLabel: t("surfaceColorHexLabel")
    },
    {
      name: "fieldColor",
      label: t("fieldColorSection"),
      hint: t("fieldColorHint"),
      hexLabel: t("fieldColorHexLabel")
    },
    {
      name: "textColor",
      label: t("textColorSection"),
      hint: t("textColorHint"),
      hexLabel: t("textColorHexLabel")
    },
    {
      name: "themeColor",
      label: t("themeColorSection"),
      hint: t("themeColorHint"),
      hexLabel: t("themeColorHexLabel")
    }
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-meta text-[0.6875rem] uppercase tracking-[0.1em] text-fg-subtle">
            {t("editingPalette", {
              mode:
                mode === "light"
                  ? t("paletteModeLight")
                  : t("paletteModeDark")
            })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="compact" onClick={onGenerate}>
            {t("generatePalette")}
          </Button>
          {onUndoGenerate && (
            <Button
              type="button"
              size="compact"
              variant="ghost"
              onClick={onUndoGenerate}
            >
              {t("undoGeneratedPalette")}
            </Button>
          )}
          {Object.values(palette).some(Boolean) && (
            <Button
              type="button"
              size="compact"
              variant="ghost"
              onClick={onReset}
            >
              {t("resetPalette")}
            </Button>
          )}
        </div>
      </div>
      {fields.map((field) => (
        <PaletteColorField
          key={field.name}
          label={field.label}
          hint={field.hint}
          hexLabel={field.hexLabel}
          resetLabel={t("resetColor")}
          value={palette[field.name]}
          defaultValue={defaults[field.name]}
          onChange={(value) => onColorChange(field.name, value)}
        />
      ))}
    </div>
  );
}

/** A small public page drawn in the palette: a card, a field and a button. */
export function PalettePublicSpecimenBody() {
  const t = useTranslations("adminSite");
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="font-display text-xl font-semibold text-fg">
        {t("themePreviewTitle")}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-fg-muted">
        {t("themePreviewBody")}
      </p>
      <label className="mt-4 block text-xs font-semibold text-fg-subtle">
        {t("themePreviewFieldLabel")}
        <span className="mt-1 block min-h-11 rounded-lg border border-border-strong bg-control px-3 py-2.5 text-sm font-normal text-fg">
          {t("themePreviewFieldValue")}
        </span>
      </label>
      <span className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg">
        {t("themeColorPreviewAction")}
      </span>
    </div>
  );
}

/**
 * Live preview frame: the palette's tokens scoped to a specimen, its swatches,
 * and the contrast verdict for the colours being edited.
 */
export function PaletteSpecimen({
  title,
  mode,
  previewColors,
  contrast,
  invalid,
  children
}: {
  title: string;
  mode: SiteThemeMode;
  previewColors: SiteThemeColors;
  contrast: number;
  invalid: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("adminSite");
  const preview = effectiveSitePalette(previewColors, mode);

  return (
    <div
      className="overflow-hidden rounded-xl border border-border-strong bg-page"
      style={sitePaletteStyle(previewColors, mode)}
      aria-label={t("themeColorPreview")}
    >
      <div className="flex items-center justify-between border-b border-border bg-page px-4 py-3">
        <span className="font-display text-lg font-semibold text-fg">
          {title}
        </span>
        <span className="font-meta text-[0.6875rem] tracking-[0.14em] text-accent">
          01 / {t("themeColorPreviewLabel")}
        </span>
      </div>
      <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_9rem] sm:p-5">
        {children}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-1">
          {[
            [t("paletteCanvasShort"), preview.backgroundColor],
            [t("paletteSurfaceShort"), preview.surfaceColor],
            [t("paletteFieldShort"), preview.fieldColor],
            [t("paletteTextShort"), preview.textColor],
            [t("paletteButtonShort"), preview.themeColor]
          ].map(([label, swatch]) => (
            <div
              key={label}
              className="rounded-lg border border-border bg-raised p-2"
            >
              <span
                aria-hidden="true"
                className="mb-2 block h-5 rounded-md border border-border"
                style={{ backgroundColor: swatch }}
              />
              <span className="font-meta block truncate text-[0.625rem] uppercase tracking-[0.08em] text-fg-subtle">
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface px-4 py-3 text-xs">
        <span className="text-fg-subtle">
          {t("paletteContrast", { ratio: contrast.toFixed(2) })}
        </span>
        {!invalid && contrast >= 4.5 ? (
          // The management screens' status colours are tuned for their own
          // theme, not for the palette drawn here, so the verdict uses the
          // palette's text colour and a mark.
          <span className="font-semibold text-fg">
            <span aria-hidden="true">✓ </span>
            <span>
              {contrast >= GENERATED_PALETTE_TEXT_CONTRAST
                ? t("paletteContrastExcellent")
                : t("paletteContrastPass")}
            </span>
          </span>
        ) : (
          <span className="font-semibold text-fg">
            <span aria-hidden="true">✕ </span>
            <span>
              {invalid ? t("paletteInvalidColor") : t("paletteContrastFail")}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
