export interface StreamPhoto {
  id: string;
  url: string;
  alt: string;
  width: number;
  height: number;
  homeWeight: number;
}

export interface StreamEvent {
  slug: string;
  title: string;
  date: string | null;
  location: string;
  photos: StreamPhoto[];
}

export interface HomePhotoStreamPage {
  events: StreamEvent[];
  nextCursor: string | null;
}

/**
 * "GRID" crops frames into an even contact sheet; "COLLAGE" keeps every photo
 * uncropped at its own aspect ratio.
 */
export const HOME_STREAM_LAYOUTS = ["GRID", "COLLAGE"] as const;
export type HomeStreamLayout = (typeof HOME_STREAM_LAYOUTS)[number];

export function resolveHomeStreamLayout(
  value?: string | null
): HomeStreamLayout {
  return value === "COLLAGE" ? "COLLAGE" : "GRID";
}
