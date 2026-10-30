"use server";

import { revalidateTag } from "next/cache";
import { isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  TEXT_LOCALES,
  builtInText,
  checkText,
  isEditableKey,
  type TextLocale,
  type TextProblem
} from "@/lib/textOverrideRules";
import { TEXT_OVERRIDES_TAG } from "@/lib/textOverrides";

/** One piece of menu text as editing mode shows it: the built-in words and any rewording, per language. */
export interface EditableText {
  key: string;
  text: Record<TextLocale, { builtIn: string; value: string }>;
}

export type TextEntry = { key: string } & Record<TextLocale, string>;

export type SaveTextResult =
  | { ok: true }
  | { ok: false; problem: TextProblem | "forbidden"; key?: string; locale?: TextLocale };

// A menu item has a label and a subtitle; a heading one line.
const MAX_KEYS = 4;

function keyList(keys: unknown): string[] | null {
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > MAX_KEYS) return null;
  return keys.every(isEditableKey) ? Array.from(new Set(keys)) : null;
}

/** The text behind a menu item, for its editor. Platform admins only. */
export async function textForEditing(keys: string[]): Promise<EditableText[] | null> {
  const list = keyList(keys);
  if (!list || !(await isAdmin())) return null;
  const rows = await prisma.textOverride.findMany({ where: { key: { in: list } } });
  return list.map((key) => ({
    key,
    text: Object.fromEntries(
      TEXT_LOCALES.map((locale) => [
        locale,
        {
          builtIn: builtInText(key, locale) ?? "",
          value: rows.find((row) => row.key === key && row.locale === locale)?.value ?? ""
        }
      ])
    ) as EditableText["text"]
  }));
}

/**
 * Save an admin's wording, in both languages at once. Empty, or the same as
 * the built-in text, removes the rewording, which is how Reset works. Nothing
 * is saved unless every value passes.
 */
export async function saveText(entries: TextEntry[]): Promise<SaveTextResult> {
  if (!(await isAdmin())) return { ok: false, problem: "forbidden" };
  const keys = keyList(Array.isArray(entries) ? entries.map((entry) => entry?.key) : null);
  if (!keys || keys.length !== entries.length) return { ok: false, problem: "key" };

  const writes = [];
  for (const entry of entries) {
    for (const locale of TEXT_LOCALES) {
      const raw = entry[locale];
      if (typeof raw !== "string") return { ok: false, problem: "key", key: entry.key, locale };
      const value = raw.trim();
      const where = { key_locale: { key: entry.key, locale } };
      if (!value || value === builtInText(entry.key, locale)) {
        writes.push(prisma.textOverride.deleteMany({ where: { key: entry.key, locale } }));
        continue;
      }
      const problem = checkText(entry.key, locale, value);
      if (problem) return { ok: false, problem, key: entry.key, locale };
      writes.push(prisma.textOverride.upsert({ where, create: { key: entry.key, locale, value }, update: { value } }));
    }
  }
  await prisma.$transaction(writes);
  revalidateTag(TEXT_OVERRIDES_TAG);
  return { ok: true };
}
