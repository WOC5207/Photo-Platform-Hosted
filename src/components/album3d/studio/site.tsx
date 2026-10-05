"use client";

import { startTransition, useActionState, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { updateSiteSettings, type SiteSettingsSection, type SiteSettingsState } from "@/app/[locale]/dashboard/(protected)/settings/actions";
import { wrap } from "../hud";
import type { BoardTile } from "../board";
import { fieldClass, isInteractive, primaryClass, useScene, useScreenKeys, useStageInput } from "../booking/shared";
import { FormNote } from "./shared";

/** Pieces shared by the site settings screens. */

export const labelClass = "grid gap-1 text-sm font-semibold text-fg-muted";
export const checkClass = "h-4 w-4 shrink-0 accent-[var(--color-accent)]";

/**
 * The board's cards and the focus they share with the panel: arrows and the
 * stage move it, and Enter (or picking the raised card) runs `open`.
 */
export function useSiteBoard(id: string, tiles: BoardTile[], open?: (index: number) => void) {
  const scene = useScene("board");
  const [focus, setFocus] = useState(0);
  const at = Math.min(focus, Math.max(0, tiles.length - 1));
  useEffect(() => {
    scene?.setTiles("events", id, tiles, [], "");
  }, [scene, tiles, id]);
  useEffect(() => {
    scene?.setFocus(at);
  }, [scene, at]);

  const move = (delta: number) => tiles.length && setFocus(wrap(at + delta, tiles.length));
  useScreenKeys((k, target) => {
    if (k === "ArrowUp" || k === "ArrowLeft") move(-1);
    else if (k === "ArrowDown" || k === "ArrowRight") move(1);
    else if (k === "Enter" && open && !isInteractive(target)) open(at);
    else return false;
    return true;
  });
  useStageInput((input) => {
    const across = scene?.columns() ?? 1;
    if (input.kind === "pick") {
      if (input.index === at && open) open(at);
      else setFocus(input.index);
    } else if (input.kind === "wheel") move(input.direction);
    else move(input.y !== 0 ? input.y * across : input.x);
  });
  return [at, setFocus] as const;
}

/**
 * One settings group's save. The form is submitted by hand so React leaves
 * its fields as typed; the classic action revalidates the page, which brings
 * the saved values back as props.
 */
export function useSiteSave() {
  const [state, action, pending] = useActionState<SiteSettingsState, FormData>(updateSiteSettings, {});
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
  };
  return { state, pending, submit };
}

/** The save button and what came of the last save. */
export function SaveBar({ section, state, pending, disabled }: { section: SiteSettingsSection; state: SiteSettingsState; pending: boolean; disabled?: boolean }) {
  const t = useTranslations("album3d");
  const tc = useTranslations("common");
  const ts = useTranslations("adminSite");
  return (
    <div className="grid gap-2">
      <input type="hidden" name="section" value={section} />
      <button type="submit" disabled={pending || disabled} className={primaryClass}>
        {pending ? t("studioSaving") : tc("save")}
        <span aria-hidden="true">→</span>
      </button>
      {!pending && state.error && (
        <FormNote tone="error">
          {ts(state.error === "themeContrast" ? "paletteContrastSaveError" : state.error === "priceNoticeRequired" ? "bookingPriceSaveError" : "saveError")}
        </FormNote>
      )}
      {!pending && state.ok && <FormNote tone="ok">{t("studioSaved")}</FormNote>}
    </div>
  );
}

/** A text setting in both languages, side by side when there is room. */
export function Pair({ en, zh, values, labels, max }: { en: string; zh: string; values: object; labels: [string, string]; max: number }) {
  const value = values as Record<string, string>;
  return (
    <div className="grid gap-3 wide:grid-cols-2">
      {[en, zh].map((name, i) => (
        <label key={name} className={labelClass}>
          {labels[i]}
          <input name={name} defaultValue={value[name]} maxLength={max} className={fieldClass} />
        </label>
      ))}
    </div>
  );
}

/** An on/off setting with its explanation underneath. */
export function Check({ children, hint, ...input }: { children: ReactNode; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex items-start gap-3 text-sm">
      <input type="checkbox" {...input} className={`mt-0.5 ${checkClass}`} />
      <span className="grid gap-1">
        <span className={input.disabled ? "text-fg-subtle" : "font-semibold"}>{children}</span>
        {hint && <span className="text-xs leading-5 text-fg-subtle">{hint}</span>}
      </span>
    </label>
  );
}

/** A titled block inside a settings panel. */
export function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="grid gap-3 border-t border-border-strong pt-5">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-[0.06em]">{title}</h2>
        {hint && <p className="mt-1 text-xs leading-5 text-fg-subtle">{hint}</p>}
      </div>
      {children}
    </section>
  );
}
