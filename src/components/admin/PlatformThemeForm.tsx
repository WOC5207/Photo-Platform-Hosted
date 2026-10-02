"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Button from "@/components/ui/Button";
import FormActionBar from "@/components/ui/FormActionBar";
import StatusMessage from "@/components/ui/StatusMessage";
import {
  EMPTY_SITE_PALETTE,
  PaletteFieldEditor,
  PaletteModeSwitch,
  PalettePublicSpecimenBody,
  PaletteSpecimen,
  paletteHasInvalidValue
} from "@/components/admin/SitePaletteEditor";
import {
  savePublicTheme,
  type PublicThemeState
} from "@/app/[locale]/admin/(protected)/actions";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import {
  DEFAULT_SITE_DARK_PALETTE,
  DEFAULT_SITE_PALETTE,
  generateAccessibleSitePalette,
  siteThemeMinimumContrast,
  type SiteThemeColors,
  type SiteThemeMode
} from "@/lib/themeColor";

type Palettes = Record<SiteThemeMode, SiteThemeColors>;

const FIELD_NAMES: Record<SiteThemeMode, Record<keyof SiteThemeColors, string>> = {
  light: {
    backgroundColor: "publicBackgroundColor",
    surfaceColor: "publicSurfaceColor",
    fieldColor: "publicFieldColor",
    textColor: "publicTextColor",
    themeColor: "publicThemeColor"
  },
  dark: {
    backgroundColor: "publicDarkBackgroundColor",
    surfaceColor: "publicDarkSurfaceColor",
    fieldColor: "publicDarkFieldColor",
    textColor: "publicDarkTextColor",
    themeColor: "publicDarkThemeColor"
  }
};

export default function PlatformThemeForm({ initial }: { initial: Palettes }) {
  const t = useTranslations("adminTheme");
  const ts = useTranslations("adminSite");
  const tc = useTranslations("common");
  const [state, formAction, pending] = useActionState<
    PublicThemeState,
    FormData
  >(savePublicTheme, {});
  const [palettes, setPalettes] = useState<Palettes>(initial);
  const [mode, setMode] = useState<SiteThemeMode>("light");
  const [dirty, setDirty] = useState(false);
  // The palette a "Generate" replaced, per mode, so it can be put back.
  const [beforeGeneration, setBeforeGeneration] = useState<
    Partial<Palettes>
  >({});

  useUnsavedChanges(dirty, tc("unsavedNavigationConfirm"));

  useEffect(() => {
    if (state.ok) {
      setDirty(false);
      setBeforeGeneration({});
    }
  }, [state]);

  function replacePalette(next: SiteThemeColors, keepUndo = false) {
    setPalettes((current) => ({ ...current, [mode]: next }));
    if (!keepUndo) {
      setBeforeGeneration((current) => {
        const copy = { ...current };
        delete copy[mode];
        return copy;
      });
    }
    setDirty(true);
  }

  const palette = palettes[mode];
  const defaults = mode === "dark" ? DEFAULT_SITE_DARK_PALETTE : DEFAULT_SITE_PALETTE;
  const contrast = siteThemeMinimumContrast(palette, mode);
  const invalid = paletteHasInvalidValue(palette);
  // Both modes are saved together, so either one failing blocks the save.
  const blocked = (["light", "dark"] as const).some(
    (each) =>
      paletteHasInvalidValue(palettes[each]) ||
      siteThemeMinimumContrast(palettes[each], each) < 4.5
  );
  const generated = beforeGeneration[mode];

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {(["light", "dark"] as const).flatMap((each) =>
        (Object.keys(FIELD_NAMES[each]) as Array<keyof SiteThemeColors>).map(
          (color) => (
            <input
              key={FIELD_NAMES[each][color]}
              type="hidden"
              name={FIELD_NAMES[each][color]}
              value={palettes[each][color]}
            />
          )
        )
      )}

      <section className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-semibold">{t("paletteTitle")}</h2>
            <p className="mt-1 text-sm leading-relaxed text-fg-subtle">
              {mode === "light"
                ? ts("lightPaletteHint")
                : ts("darkPaletteHint")}{" "}
              {t("defaultNote")}
            </p>
          </div>
          <PaletteModeSwitch mode={mode} onChange={setMode} />
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.08fr)_minmax(20rem,0.92fr)] lg:items-start">
          <PaletteSpecimen
            title={tc("siteName")}
            mode={mode}
            previewColors={palette}
            contrast={contrast}
            invalid={invalid}
          >
            <PalettePublicSpecimenBody />
          </PaletteSpecimen>

          <PaletteFieldEditor
            mode={mode}
            palette={palette}
            defaults={defaults}
            onColorChange={(name, value) =>
              replacePalette({ ...palette, [name]: value })
            }
            onGenerate={() => {
              setBeforeGeneration((current) => ({ ...current, [mode]: palette }));
              replacePalette(generateAccessibleSitePalette(mode), true);
            }}
            onUndoGenerate={
              generated ? () => replacePalette(generated) : undefined
            }
            onReset={() => replacePalette({ ...EMPTY_SITE_PALETTE })}
          />
        </div>
      </section>

      {(dirty || pending || state.error || state.ok) && (
        <FormActionBar>
          <Button
            type="submit"
            disabled={pending || !dirty || blocked}
            variant="primary"
            className="px-5"
          >
            {tc("save")}
          </Button>
          {dirty && !pending && (
            <p className="text-sm text-fg-muted" role="status">
              {ts("unsavedChanges")}
            </p>
          )}
          {blocked && dirty ? (
            <StatusMessage kind="error">{t("contrastSaveError")}</StatusMessage>
          ) : (
            state.error && (
              <StatusMessage kind="error">
                {state.error === "themeContrast"
                  ? t("contrastSaveError")
                  : t("saveError")}
              </StatusMessage>
            )
          )}
          {state.ok && !dirty && (
            <StatusMessage kind="success">{tc("saved")}</StatusMessage>
          )}
        </FormActionBar>
      )}
    </form>
  );
}
