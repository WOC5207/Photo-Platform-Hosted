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
