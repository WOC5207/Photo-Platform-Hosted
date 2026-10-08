/** Data handed from the server page to the 3D album archive. */

import type { CSSProperties } from "react";

/**
 * What the poster easel's pick() adds to a rail card's or a layer's index.
 * Kept here rather than in poster.ts so screens can read them without
 * pulling three.js into their pages.
 */
export const RAIL_PICK = 1000;
export const LAYER_PICK = 2000;

/** The four positions of a packing-list tag's status switch on the gear rack, in order. */
export const RACK_STATES = ["PLANNED", "AT_EVENT", "RETURNED", "BROKEN"] as const;
export type RackState = (typeof RACK_STATES)[number];

export interface ArchivePrint {
  id: string;
  thumb: string;
  med: string;
  full: string;
  /** The full-resolution original, for the Download button. */
  download: string;
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
  /** All their public albums and photos, including any the field leaves out. */
  albumCount: number;
  photoCount: number;
  fileIndexes: number[];
}

/**
 * A photographer's saved site colours, scoped the way the platform's own
 * palette is (see platformThemeScope): each mode they coloured replaces the
 * platform's, and a mode they left empty keeps it.
 */
export interface OwnerPalette {
  className: string;
  style: CSSProperties;
  /** Their Dashboard matches their site rather than keeping the platform's look. */
  dashboard: boolean;
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
  socialLinks: { name: string; label: string; url: string }[];
  exif: { gear: string; focalLength: string; exposure: string; date: string };
}

/** An album's photos, loaded by the /photos layout of that album. */
export interface AlbumPhotos {
  username: string;
  slug: string;
  photos: TablePhoto[];
  /** Photos past the light table's limit, left to the classic page. */
  more: number;
  /** The album's cover photo, which its owner can change from the photo screen. */
  coverId: string | null;
}

// Layout shared by the scene and the HUD, so 3D objects and HTML panels line
// up. Fractions of the viewport unless noted.

type Layout = "wide" | "compact" | "portrait";

export function layoutFor(width: number, height: number): Layout {
  if (width / Math.max(1, height) < 1.05) return "portrait";
  return width < 1100 ? "compact" : "wide";
}

// Where the bottom sheet (the Dashboard and booking screens' panel) starts on
// a phone, in pixels from the top of the stage, as the sheet reports it. Its
// height follows its content, so the scenes frame themselves above it.
let sheet: { owner: object; top: number } | null = null;
let sheetListener: (() => void) | null = null;
/** The site header's height on phones, which the scene also keeps clear of. */
const PHONE_HEADER = 80;

/** A sheet reports where it starts, or (top null) that it's gone; a stale owner's report is ignored. */
export function reportSheet(owner: object, top: number | null) {
  if (top === null) {
    if (sheet?.owner !== owner) return;
    sheet = null;
  } else {
    if (sheet?.owner === owner && sheet.top === top) return;
    sheet = { owner, top };
  }
  sheetListener?.();
}

/** Called when the sheet moves, so the engine can reframe its scenes. */
export function onSheet(listener: (() => void) | null) {
  sheetListener = listener;
}

/**
 * On a phone with a sheet up, the free strip between the header and the
 * sheet: its middle and half its height as fractions of the viewport, and its
 * bottom edge in pixels. Null on wider screens or without a sheet.
 */
export function stageBand(width: number, height: number): { y: number; half: number; bottom: number } | null {
  if (!sheet || layoutFor(width, height) !== "portrait") return null;
  const top = Math.min(PHONE_HEADER, height * 0.15);
  const bottom = Math.max(top + height * 0.18, Math.min(sheet.top, height));
  return { y: (top + bottom) / 2 / height, half: (bottom - top) / 2 / height, bottom };
}

/**
 * Where a menu screen leaves room for the scene: the centre of the free area
 * and its width. Menus sit on the left of wide screens and at the bottom of
 * portrait ones (see .menuPanel in ArchiveSite.module.css, and the sheet above).
 */
export function sceneArea(width: number, height: number): { x: number; y: number; width: number } {
  switch (layoutFor(width, height)) {
    case "wide":
      return { x: 0.68, y: 0.52, width: 0.56 };
    case "compact":
      return { x: 0.76, y: 0.5, width: 0.44 };
    case "portrait":
      return { x: 0.5, y: stageBand(width, height)?.y ?? 0.3, width: 0.96 };
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
      return { left: 20, top: 104, right: width - 20, bottom: stageBand(width, height)?.bottom ?? height * 0.56 };
  }
}
