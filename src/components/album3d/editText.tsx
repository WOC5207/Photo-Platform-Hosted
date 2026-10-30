"use client";

import { createContext, lazy, Suspense, useContext, useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

/**
 * Editing mode: a platform admin turns on Edit text in Settings, and every
 * menu label and heading that takes its words from the messages gets a
 * pencil. The editor loads only when a pencil is first used.
 */

interface EditText {
  editing: boolean;
  open: (keys: string[], shown: string) => void;
}

const EditTextContext = createContext<EditText>({ editing: false, open: () => undefined });

const TextEditor = lazy(() => import("./TextEditor"));

export const EDIT_TEXT_KEY = "album3d-edit-text";

export function EditTextProvider({ editing, children }: { editing: boolean; children: ReactNode }) {
  const [target, setTarget] = useState<{ keys: string[]; shown: string; from: HTMLElement | null } | null>(null);
  const value = useMemo<EditText>(
    () => ({
      editing,
      open: (keys, shown) => setTarget({ keys, shown, from: document.activeElement as HTMLElement | null })
    }),
    [editing]
  );
  return (
    <EditTextContext.Provider value={value}>
      {children}
      {target && (
        <Suspense fallback={null}>
          <TextEditor
            key={target.keys.join()}
            keys={target.keys}
            shown={target.shown}
            onClose={() => {
              target.from?.focus();
              setTarget(null);
            }}
          />
        </Suspense>
      )}
    </EditTextContext.Provider>
  );
}

/** The pencil beside a piece of text, shown only in editing mode. `shown` is the text as it reads now. */
export function EditTextButton({ keys, shown, className = "" }: { keys?: string[]; shown: string; className?: string }) {
  const t = useTranslations("album3d");
  const { editing, open } = useContext(EditTextContext);
  if (!editing || !keys?.length) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        open(keys, shown);
      }}
      aria-label={t("editTextOf", { text: shown })}
      title={t("editTextOf", { text: shown })}
      className={`grid shrink-0 place-items-center text-base text-fg-subtle transition hover:bg-fg/[0.06] hover:text-accent-text ${className}`}
    >
      <span aria-hidden="true">✎</span>
    </button>
  );
}
