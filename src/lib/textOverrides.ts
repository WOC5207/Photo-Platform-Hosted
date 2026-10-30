import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import type { TextLocale, TextOverrideRow } from "@/lib/textOverrideRules";

export const TEXT_OVERRIDES_TAG = "text-overrides";

/**
 * Admins' wording for one language, for i18n/request to lay over the built-in
 * messages on every page. Saving revalidates the tag, so the wait is only for
 * changes made on another server.
 */
export async function loadTextOverrides(locale: TextLocale): Promise<TextOverrideRow[]> {
  try {
    return await unstable_cache(
      () => prisma.textOverride.findMany({ where: { locale }, select: { key: true, value: true } }),
      ["text-overrides", locale],
      { revalidate: 300, tags: [TEXT_OVERRIDES_TAG] }
    )();
  } catch {
    // The build has no database, and a deployment that hasn't migrated yet has
    // no table. Neither should take a page down over menu wording: the
    // built-in text stands in.
    return [];
  }
}
