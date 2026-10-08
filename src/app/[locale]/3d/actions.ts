"use server";

import { getLocale } from "next-intl/server";
import { loadArchiveSlice } from "@/lib/archive3d";
import type { Archive } from "@/lib/archiveField";

/**
 * One photographer's albums, for an address the field the /3d layout loaded
 * doesn't hold (see loadArchiveSlice). Public data only, like the layout's.
 */
export async function archiveSlice(username: string, slug?: string): Promise<Archive | null> {
  if (typeof username !== "string" || !username || username.length > 100) return null;
  if (slug !== undefined && (typeof slug !== "string" || !slug || slug.length > 200)) return null;
  return loadArchiveSlice(await getLocale(), username, slug);
}
