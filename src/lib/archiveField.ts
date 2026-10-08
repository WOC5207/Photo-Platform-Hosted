import type { ArchiveColumn, ArchiveFile } from "@/components/album3d/types";

/**
 * Choosing what the new site's field holds, and growing it. Pure, so the
 * server's choice and the client's join are tested without a database or a
 * scene (scripts/test-archive-field.ts).
 */

export type Archive = { files: ArchiveFile[]; columns: ArchiveColumn[] };

/**
 * Which albums take the field's `max` places, from candidates in directory
 * order (photographers in turn, each one's albums newest first). Places go
 * out in rounds: every photographer's newest album, then everyone's second,
 * and so on, so no photographer drops out because others signed up earlier
 * or publish more.
 */
export function fairField(candidates: { id: string; ownerId: string }[], max: number): string[] {
  const taken = new Map<string, number>();
  const order = new Map<string, number>();
  return candidates
    .map((c) => {
      const round = taken.get(c.ownerId) ?? 0;
      taken.set(c.ownerId, round + 1);
      if (!order.has(c.ownerId)) order.set(c.ownerId, order.size);
      return { id: c.id, round, owner: order.get(c.ownerId)! };
    })
    .sort((a, b) => a.round - b.round || a.owner - b.owner)
    .slice(0, max)
    .map((c) => c.id);
}

/**
 * One photographer's albums for an address past the field: their newest
 * `max`, plus `slug` when it is older. Null when `slug` isn't theirs.
 */
export function sliceAlbums(candidates: { id: string; slug: string }[], max: number, slug?: string): string[] | null {
  const asked = slug === undefined ? undefined : candidates.find((c) => c.slug === slug);
  if (slug !== undefined && !asked) return null;
  const ids = candidates.slice(0, max).map((c) => c.id);
  if (asked && !ids.includes(asked.id)) ids.push(asked.id);
  return ids;
}

/**
 * The archive with one photographer's slice joined on: a new photographer
 * becomes the last column, and albums the field didn't hold follow theirs
 * (older, so the lane stays newest first). Existing indexes don't move, so
 * the scene's selection survives. Null when the slice adds nothing.
 */
export function joinSlice(archive: Archive, slice: Archive): Archive | null {
  const incoming = slice.columns[0];
  if (!incoming) return null;
  const files = [...archive.files];
  const columns = archive.columns.map((c) => ({ ...c, fileIndexes: [...c.fileIndexes] }));
  let at = columns.findIndex((c) => c.username === incoming.username);
  if (at < 0) at = columns.push({ ...incoming, fileIndexes: [] }) - 1;
  const held = new Set(columns[at].fileIndexes.map((i) => files[i].id));
  for (const file of slice.files) {
    if (held.has(file.id)) continue;
    columns[at].fileIndexes.push(files.length);
    files.push({ ...file, column: at, number: files.length + 1 });
  }
  return files.length === archive.files.length && columns.length === archive.columns.length ? null : { files, columns };
}
