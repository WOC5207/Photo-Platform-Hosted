"use client";

import { createContext } from "react";
import type { Screen } from "@/lib/siteMode";
import type { ArchiveEngine } from "./engine";

/**
 * What the 3D site hands to screens rendered by their own pages (booking and
 * the prize draw): the scene once it is ready, moving between screens, and
 * the key names for hints. Screens go through here rather than importing
 * lib/siteMode, which would split it out of the 3D site's first load.
 */
export interface Stage {
  /** Null until three.js has loaded, and without WebGL. */
  engine: ArchiveEngine | null;
  go(screen: Screen): void;
  path(screen: Screen): string;
  back(): void;
  /** Key names for hints. "alt" is /. */
  key(name: "move" | "confirm" | "back" | "sides" | "alt"): string;
  touch: boolean;
}

export const StageContext = createContext<Stage | null>(null);

/** One of the photographer's own albums in the field, as the Dashboard's home names it. */
export interface FieldAlbum {
  index: number;
  title: string;
  date: string;
  photos: number;
}

/**
 * The album field behind the Dashboard's home, kept to the photographer's own
 * albums, which can be browsed there and opened from (see the engine's
 * setBrowse and setLane). Null on every other screen.
 */
export interface FieldPick {
  /** The scene is up or on its way; false without WebGL, when there is no field to look at. */
  live: boolean;
  /** The photographer has no published album to show, so the field is left empty. */
  empty: boolean;
  /** The album under the mouse, if any. */
  hovered: FieldAlbum | null;
  /** The album the field rests on, which a finger moves along. */
  resting: FieldAlbum | null;
  /** Straight into the album's own screen. */
  open(index: number): void;
  /** Moves the field on to the photographer's previous or next album. */
  step(direction: -1 | 1): void;
}

export const FieldContext = createContext<FieldPick | null>(null);
