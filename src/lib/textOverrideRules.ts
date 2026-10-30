import { createTranslator, type AbstractIntlMessages } from "next-intl";
import en from "../../messages/en.json";
import zh from "../../messages/zh.json";
import { TEXT_LOCALES, TEXT_OVERRIDE_MAX, type TextLocale } from "./textOverrideLimits";

/**
 * What platform admins may reword in editing mode, and how their wording is
 * laid over the built-in messages. Kept apart from lib/textOverrides so the
 * rules can be tested without a database.
 */

export { TEXT_LOCALES, TEXT_OVERRIDE_MAX, type TextLocale };

// The new site's menus and the Dashboard's sections take their words from
// these. Errors, notices and legal text live elsewhere and stay as written.
const EDITABLE_NAMESPACES = new Set(["album3d", "admin", "adminSite", "nav"]);

const BUILT_IN: Record<TextLocale, AbstractIntlMessages> = { en, zh };

export interface TextOverrideRow {
  key: string;
  value: string;
}

export type TextProblem = "key" | "long" | "arguments" | "syntax";

export function isTextLocale(value: unknown): value is TextLocale {
  return TEXT_LOCALES.includes(value as TextLocale);
}

function lookup(messages: AbstractIntlMessages, key: string): string | null {
  let node: AbstractIntlMessages | string | undefined = messages;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || !Object.hasOwn(node, part)) return null;
    node = node[part];
  }
  return typeof node === "string" ? node : null;
}

/** The text a key shows when no one has reworded it, or null if there is no such text. */
export function builtInText(key: string, locale: TextLocale): string | null {
  return lookup(BUILT_IN[locale], key);
}

export function isEditableKey(key: unknown): key is string {
  if (typeof key !== "string" || key.length > 200) return false;
  const namespace = key.split(".")[0];
  return EDITABLE_NAMESPACES.has(namespace) && TEXT_LOCALES.every((locale) => builtInText(key, locale) !== null);
}

/** Every {name} a message fills in, at any depth of its plural or select branches. */
export function argumentNames(message: string): Set<string> {
  return new Set(Array.from(message.matchAll(/\{\s*([A-Za-z_]\w*)\s*[,}]/g), (m) => m[1]));
}

function formats(message: string, locale: TextLocale, names: Set<string>): boolean {
  let ok = true;
  const t = createTranslator({
    locale,
    messages: { text: message },
    onError: () => {
      ok = false;
    }
  });
  t("text", Object.fromEntries(Array.from(names, (name) => [name, 1])));
  return ok;
}

/**
 * Why an admin's wording for one key and language can't be used, or null when
 * it can. It may drop a value the built-in text fills in (say, a count) but
 * not name one the page doesn't pass, and it has to format.
 */
export function checkText(key: string, locale: TextLocale, value: string): TextProblem | null {
  const original = isEditableKey(key) ? builtInText(key, locale) : null;
  if (original === null) return "key";
  if (value.length > TEXT_OVERRIDE_MAX) return "long";
  const names = argumentNames(original);
  const unknown = () => Array.from(argumentNames(value)).some((name) => !names.has(name));
  // Text with markup formats only through t.rich, so a test format fails for
  // the built-in text too; the names are all it can be checked on. Otherwise
  // a format with the page's values finds both broken brackets and names the
  // page doesn't pass (which the name scan alone can't tell from a plural's
  // {one} branch).
  if (!formats(original, locale, names)) return unknown() ? "arguments" : null;
  if (formats(value, locale, names)) return null;
  return unknown() ? "arguments" : "syntax";
}

/**
 * The messages with admins' wording in place. Only the namespaces and groups
 * on a reworded key's path are copied, and a row whose key no longer exists
 * (or is no longer editable) is skipped rather than adding text nothing reads.
 */
export function applyTextOverrides(messages: AbstractIntlMessages, rows: TextOverrideRow[]): AbstractIntlMessages {
  let result = messages;
  for (const { key, value } of rows) {
    if (!value || !isEditableKey(key) || lookup(result, key) === null) continue;
    const parts = key.split(".");
    const copy = { ...result };
    let node: AbstractIntlMessages = copy;
    for (const part of parts.slice(0, -1)) {
      node[part] = { ...(node[part] as AbstractIntlMessages) };
      node = node[part] as AbstractIntlMessages;
    }
    node[parts[parts.length - 1]] = value;
    result = copy;
  }
  return result;
}
