/**
 * The languages and length limit for admins' menu wording, apart from
 * lib/textOverrideRules so the editor can use them without loading the
 * message files that module reads.
 */

export const TEXT_LOCALES = ["en", "zh"] as const;
export type TextLocale = (typeof TEXT_LOCALES)[number];

/** Long enough for a menu subtitle, short enough that a phone menu still fits. */
export const TEXT_OVERRIDE_MAX = 120;
