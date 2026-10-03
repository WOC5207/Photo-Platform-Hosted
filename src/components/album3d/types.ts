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

/** One photo of an album, for the light table and the photo screen. */
export interface TablePhoto {
  id: string;
  thumb: string;
  med: string;
  full: string;
  width: number;
  height: number;
  caption: string;
  comment: string;
  socialLinks: { label: string; url: string }[];
  exif: { gear: string; focalLength: string; exposure: string; date: string };
}

/** An album's photos, loaded by the /photos layout of that album. */
export interface AlbumPhotos {
  username: string;
  slug: string;
  photos: TablePhoto[];
  /** Photos past the light table's limit, left to the classic page. */
  more: number;
}

// Layout shared by the scene and the HUD, so 3D objects and HTML panels line
// up. Fractions of the viewport unless noted.

type Layout = "wide" | "compact" | "portrait";

export function layoutFor(width: number, height: number): Layout {
  if (width / Math.max(1, height) < 1.05) return "portrait";
  return width < 1100 ? "compact" : "wide";
}

/**
 * Where a menu screen leaves room for the scene: the centre of the free area
 * and its width. Menus sit on the left of wide screens and at the bottom of
 * portrait ones (see .menuPanel in ArchiveSite.module.css).
 */
export function sceneArea(width: number, height: number): { x: number; y: number; width: number } {
  switch (layoutFor(width, height)) {
    case "wide":
      return { x: 0.68, y: 0.52, width: 0.56 };
    case "compact":
      return { x: 0.76, y: 0.5, width: 0.44 };
    case "portrait":
      return { x: 0.5, y: 0.3, width: 0.96 };
  }
}

/** Light table columns for a viewport. */
export function tableColumns(width: number, height: number): number {
  const layout = layoutFor(width, height);
  return layout === "wide" ? 5 : layout === "compact" ? 4 : 3;
}

/** The box a raised photo fills, in pixels: left of the info panel, or above it on portrait screens. */
export function photoRect(width: number, height: number): { left: number; top: number; right: number; bottom: number } {
  switch (layoutFor(width, height)) {
    case "wide":
      return { left: 60, top: 120, right: width * 0.64, bottom: height - 96 };
    case "compact":
      return { left: 20, top: 84, right: width * 0.58, bottom: height - 60 };
    case "portrait":
      return { left: 20, top: 104, right: width - 20, bottom: height * 0.56 };
  }
}
