"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import SiteImageUploader from "@/components/admin/SiteImageUploader";
import { EMPTY_SITE_PALETTE, PaletteFieldEditor, PaletteModeSwitch, paletteHasInvalidValue } from "@/components/admin/SitePaletteEditor";
import {
  DEFAULT_SITE_DARK_PALETTE,
  DEFAULT_SITE_PALETTE,
  generateAccessibleSitePalette,
  resolveDashboardThemeMode,
  siteThemeMinimumContrast,
  siteThemeStyle,
  type SiteThemeColors,
  type SiteThemeMode
} from "@/lib/themeColor";
import type { BoardTile } from "../board";
import { BookingPanel, metaLabel } from "../booking/shared";
import { ClassicLink, StudioHeading } from "./shared";
import { Group, Pair, SaveBar, checkClass, useSiteBoard, useSiteSave } from "./site";
import type { StudioSite } from "./types";

const COLOURS = ["backgroundColor", "surfaceColor", "fieldColor", "textColor", "themeColor"] as const;
const SHORT = ["paletteCanvasShort", "paletteSurfaceShort", "paletteFieldShort", "paletteTextShort", "paletteButtonShort"] as const;
const dark = (name: string) => `dark${name[0].toUpperCase()}${name.slice(1)}`;

/**
 * Paints the palette being edited onto the 3D site itself: its custom
 * properties go on the site's root, and touching the html class makes the
 * scene re-read them (it follows the theme toggle the same way).
 */
function usePalettePreview(palette: SiteThemeColors) {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".album3d");
    if (!root) return;
    const style = siteThemeStyle(palette) as Record<string, string>;
    for (const [name, value] of Object.entries(style)) root.style.setProperty(name, value);
    document.documentElement.classList.toggle("album3d-preview");
    return () => {
      for (const name of Object.keys(style)) root.style.removeProperty(name);
      document.documentElement.classList.toggle("album3d-preview");
    };
  }, [palette]);
}

/**
 * Site title, logo, both palettes and the background image. The palette
 * being edited is previewed on the 3D site as it changes, and its five
 * colours sit on the board.
 */
export default function AppearanceScreen({ site }: { site: StudioSite }) {
  const t = useTranslations("album3d");
  const ts = useTranslations("adminSite");
  const { state, pending, submit } = useSiteSave();
  const v = site.values as unknown as Record<string, string>;
  const [palettes, setPalettes] = useState<Record<SiteThemeMode, SiteThemeColors>>(() => ({
    light: Object.fromEntries(COLOURS.map((c) => [c, v[c]])) as SiteThemeColors,
    dark: Object.fromEntries(COLOURS.map((c) => [c, v[dark(c)]])) as SiteThemeColors
  }));
  const [mode, setMode] = useState<SiteThemeMode>("light");
  const [undo, setUndo] = useState<Partial<Record<SiteThemeMode, SiteThemeColors>>>({});
  const palette = palettes[mode];
  const defaults = mode === "dark" ? DEFAULT_SITE_DARK_PALETTE : DEFAULT_SITE_PALETTE;
  const contrast = siteThemeMinimumContrast(palette, mode);
  const invalid = paletteHasInvalidValue(palette);
  usePalettePreview(palette);

  const set = (next: SiteThemeColors, before?: SiteThemeColors) => {
    setPalettes((current) => ({ ...current, [mode]: next }));
    setUndo((current) => ({ ...current, [mode]: before }));
  };

  const tiles = useMemo<BoardTile[]>(
    () =>
      COLOURS.map((name, i) => ({
        id: name,
        column: 0,
        row: i,
        kicker: ts(mode === "light" ? "paletteModeLight" : "paletteModeDark"),
        main: ts(SHORT[i]),
        detail: palette[name] ? [] : [defaults[name]],
        left: palette[name] ? 1 : 0,
        total: 1,
        status: palette[name] ? palette[name].toUpperCase() : ts("colorDefault")
      })),
    [palette, defaults, mode, ts]
  );
  useSiteBoard(`studio-appearance:${site.account.username}`, tiles);

  return (
    <BookingPanel expanded>
      <StudioHeading trail={t("studioCrumbs.site")} title={ts("settingsTabAppearance")} />
      <form onSubmit={submit} aria-busy={pending} className="mt-6 grid gap-6">
        {(["light", "dark"] as const).flatMap((m) =>
          COLOURS.map((c) => <input key={`${m}${c}`} type="hidden" name={m === "light" ? c : dark(c)} value={palettes[m][c]} />)
        )}
        <Group title={ts("groupHeaderTitle")} hint={ts("groupHeaderHint")}>
          <Pair en="siteTitleEn" zh="siteTitleZh" values={v} labels={[ts("siteTitleEn"), ts("siteTitleZh")]} max={120} />
        </Group>

        <Group title={ts("sitePaletteTitle")} hint={ts(mode === "light" ? "lightPaletteHint" : "darkPaletteHint")}>
          <p className="text-xs text-fg-subtle">{t("studioPalettePreview")}</p>
          <PaletteModeSwitch mode={mode} onChange={setMode} />
          <PaletteFieldEditor
            mode={mode}
            palette={palette}
            defaults={defaults}
            onColorChange={(name, value) => set({ ...palette, [name]: value })}
            onGenerate={() => set(generateAccessibleSitePalette(mode), palette)}
            onUndoGenerate={undo[mode] ? () => set(undo[mode]!) : undefined}
            onReset={() => set({ ...EMPTY_SITE_PALETTE })}
          />
          <p role="status" className={`text-sm ${invalid || contrast < 4.5 ? "text-danger" : "text-success"}`}>
            {ts("paletteContrast", { ratio: contrast.toFixed(2) })} · {invalid ? ts("paletteInvalidColor") : ts(contrast < 4.5 ? "paletteContrastFail" : "paletteContrastPass")}
          </p>
        </Group>

        <Group title={ts("dashboardAppearanceTitle")} hint={ts("dashboardAppearanceHint")}>
          {(["PLATFORM", "MATCH_SITE"] as const).map((m) => (
            <label key={m} className="flex items-start gap-3 border border-border-strong p-3 text-sm has-[:checked]:border-fg">
              <input type="radio" name="dashboardThemeMode" value={m} defaultChecked={resolveDashboardThemeMode(v.dashboardThemeMode) === m} className={`mt-0.5 ${checkClass}`} />
              <span className="grid gap-1">
                <span className="font-semibold">{ts(m === "PLATFORM" ? "dashboardAppearancePlatform" : "dashboardAppearanceMatch")}</span>
                <span className="text-xs leading-5 text-fg-subtle">{ts(m === "PLATFORM" ? "dashboardAppearancePlatformHint" : "dashboardAppearanceMatchHint")}</span>
              </span>
            </label>
          ))}
        </Group>
        <SaveBar section="appearance" state={state} pending={pending} disabled={invalid || contrast < 4.5} />
      </form>

      <div className="mt-8 grid gap-6">
        <p className={metaLabel}>{ts("imageChangesSaveAutomatically")}</p>
        <SiteImageUploader kind="logo" currentUrl={site.images.logo} />
        <SiteImageUploader kind="background" currentUrl={site.images.background} />
      </div>
      <ClassicLink href="/dashboard/settings?section=appearance" />
    </BookingPanel>
  );
}
