"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { saveText, textForEditing, type EditableText, type SaveTextResult, type TextEntry } from "@/app/[locale]/3d/textActions";
import { TEXT_LOCALES, TEXT_OVERRIDE_MAX, type TextLocale } from "@/lib/textOverrideLimits";
import { fieldClass, metaLabel, primaryClass, secondaryClass } from "./booking/shared";

const LANGUAGE: Record<TextLocale, "editTextEnglish" | "editTextChinese"> = { en: "editTextEnglish", zh: "editTextChinese" };

/**
 * Editing mode's editor for one menu item or heading: its words in English
 * and Chinese, side by side with the built-in text. Saving refreshes the
 * page, so the new wording shows at once, for every visitor.
 */
export default function TextEditor({ keys, shown, onClose }: { keys: string[]; shown: string; onClose: () => void }) {
  const t = useTranslations("album3d");
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [texts, setTexts] = useState<EditableText[] | null | undefined>(undefined);
  const [values, setValues] = useState<TextEntry[]>([]);
  const [failed, setFailed] = useState<Extract<SaveTextResult, { ok: false }> | null>(null);
  const [saving, startSaving] = useTransition();

  useEffect(() => {
    dialog.current?.showModal();
    let live = true;
    textForEditing(keys).then(
      (loaded) => {
        if (!live) return;
        setTexts(loaded);
        if (loaded) {
          setValues(loaded.map(({ key, text }) => ({ key, en: text.en.value || text.en.builtIn, zh: text.zh.value || text.zh.builtIn })));
        }
      },
      () => live && setTexts(null)
    );
    return () => {
      live = false;
    };
  }, [keys]);

  const set = (index: number, locale: TextLocale, value: string) => {
    setFailed(null);
    setValues((all) => all.map((entry, i) => (i === index ? { ...entry, [locale]: value } : entry)));
  };

  const save = () =>
    startSaving(async () => {
      const result = await saveText(values).catch((): SaveTextResult => ({ ok: false, problem: "syntax" }));
      if (!result.ok) return setFailed(result);
      router.refresh();
      onClose();
    });

  const message = failed && t(`editTextProblem_${failed.problem}`, { max: TEXT_OVERRIDE_MAX });
  const problem = (key: string, locale: TextLocale) => (failed?.key === key && failed.locale === locale ? message : null);

  return (
    <dialog
      ref={dialog}
      role="dialog"
      aria-labelledby="edit-text-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // The site's own keys (Esc goes back, arrows move the menu) wait while this is open.
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(40rem,calc(100vw-2rem))] overflow-y-auto border border-border-strong bg-surface p-5 text-fg shadow-2xl backdrop:bg-black/50 sm:p-6"
    >
      <p className={metaLabel}>{t("editTextTitle")}</p>
      <h2 id="edit-text-title" className="mt-2 text-2xl font-extrabold uppercase leading-tight tracking-[-0.02em] [overflow-wrap:anywhere]">
        {shown}
      </h2>
      <p className="mt-2 text-sm text-fg-muted">{t("editTextHint")}</p>

      {texts === undefined && <p className="mt-6 text-sm text-fg-muted">{t("loading")}</p>}
      {texts === null && (
        <p role="alert" className="mt-6 text-sm text-danger">
          {t("editTextUnavailable")}
        </p>
      )}
      {texts &&
        texts.map(({ key, text }, index) => (
          <fieldset key={key} className="mt-6 grid gap-4 sm:grid-cols-2">
            <legend className={`${metaLabel} mb-3`}>{t(index === 0 ? "editTextMain" : "editTextSub")}</legend>
            {TEXT_LOCALES.map((locale) => {
              const error = problem(key, locale);
              const id = `edit-text-${index}-${locale}`;
              return (
                <div key={locale} className="grid content-start gap-1.5">
                  <label htmlFor={id} className="text-sm font-semibold">
                    {t(LANGUAGE[locale])}
                  </label>
                  <textarea
                    id={id}
                    lang={locale === "zh" ? "zh-Hans" : "en"}
                    rows={2}
                    maxLength={TEXT_OVERRIDE_MAX}
                    value={values[index]?.[locale] ?? ""}
                    onChange={(e) => set(index, locale, e.target.value)}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={`${id}-built-in${error ? ` ${id}-error` : ""}`}
                    className={`${fieldClass} resize-y`}
                  />
                  <p id={`${id}-built-in`} className="text-xs text-fg-subtle [overflow-wrap:anywhere]">
                    {t("editTextBuiltIn", { text: text[locale].builtIn })}
                  </p>
                  {error && (
                    <p id={`${id}-error`} role="alert" className="text-xs text-danger">
                      {error}
                    </p>
                  )}
                </div>
              );
            })}
          </fieldset>
        ))}

      {failed && failed.key === undefined && (
        <p role="alert" className="mt-6 text-sm text-danger">
          {message}
        </p>
      )}
      {/* Pinned to the bottom, so Save stays in reach while a phone scrolls the fields. */}
      <div className="sticky -bottom-5 -mb-5 mt-6 flex flex-wrap items-center justify-end gap-3 bg-surface pb-5 pt-3 sm:-bottom-6 sm:-mb-6 sm:pb-6">
        {texts && (
          <button
            type="button"
            onClick={() => {
              setFailed(null);
              setValues(texts.map(({ key, text }) => ({ key, en: text.en.builtIn, zh: text.zh.builtIn })));
            }}
            className={`${secondaryClass} mr-auto`}
          >
            {t("editTextReset")}
          </button>
        )}
        <button type="button" onClick={onClose} className={secondaryClass}>
          {t("editTextCancel")}
        </button>
        <button type="button" onClick={save} disabled={!texts || saving} className={primaryClass}>
          {saving ? t("editTextSaving") : t("editTextSave")}
          <span aria-hidden="true" className="text-lg">→</span>
        </button>
      </div>
    </dialog>
  );
}
