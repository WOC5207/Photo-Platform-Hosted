/** Data handed from the server page to the 3D album archive. */

export interface ArchivePrint {
  thumb: string;
  med: string;
  width: number;
  height: number;
}

export interface ArchiveFile {
  id: string;
  slug: string;
  number: number;
  column: number;
  title: string;
  altTitle: string;
  location: string;
  dateLabel: string;
  photoCount: number;
  href: string;
  prints: ArchivePrint[];
}

export interface ArchiveColumn {
  username: string;
  name: string;
  /** Whether the photographer's booking page is switched on. */
  bookingEnabled: boolean;
  photoCount: number;
  fileIndexes: number[];
}

export function fileCode(n: number): string {
  return `NO.${String(n).padStart(3, "0")}`;
}
