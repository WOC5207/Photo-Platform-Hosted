import { z } from "zod";
import {
  HOME_PHOTO_WEIGHT_FALLBACK,
  normalizeHomePhotoWeight
} from "@/lib/homePhotoWeight";

export const SHARING_POSTER_MAX_PHOTOS = 9;
export const SHARING_POSTER_DEFAULT_LONG_EDGE = 2160;
export const SHARING_POSTER_MAX_EDGE = 8192;
/**
 * Area ceiling, deliberately the squarest poster at the longest edge.
 *
 * It has to move with SHARING_POSTER_MAX_EDGE or the edge becomes a promise
 * the export does not keep: a lower ceiling silently shrinks every ratio whose
 * area exceeds it, which is what the old 12 MP value did to 4096 at 1:1, 4:5
 * and 4:3. Since the short edge can never exceed the long one, no composition
 * the schema accepts can reach this now; it stays as a backstop for a
 * composition assembled in code rather than parsed.
 */
export const SHARING_POSTER_MAX_PIXELS =
  SHARING_POSTER_MAX_EDGE * SHARING_POSTER_MAX_EDGE;

/**
 * How a photo is cropped into its frame.
 * - absent: the original behaviour, `focalX`/`focalY` as fractions of the
 *   pannable range (0 flush left/top, 1 flush right/bottom).
 * - "auto": the crop is centred on the subject detected on the server (or the
 *   image centre until detection has run).
 * - "manual": an anchor in image-normalized coordinates that the crop window
 *   is centred on, so it survives ratio, layout and weight changes.
 */
export const sharingPosterCropSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("auto") }),
  z.object({
    mode: z.literal("manual"),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1)
  })
]);
export type SharingPosterCrop = z.infer<typeof sharingPosterCropSchema>;

export const sharingPosterPhotoSchema = z.object({
  photoId: z.string().min(1).max(100),
  weight: z.number().int().min(1).max(5),
  focalX: z.number().min(0).max(1),
  focalY: z.number().min(0).max(1),
  // Optional so posters saved before crop modes existed still validate.
  crop: sharingPosterCropSchema.optional()
});

/**
 * Poster background. "solid" is the original flat fill. "glass" is a soft
 * gradient drawn from the photographs' colours, weighted toward the vivid
 * ones and flowing out from each frame's sides, frosted with the background
 * colour at `tintOpacity` (see src/lib/sharingPosterGlass.ts).
 */
export const sharingPosterBackgroundSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("solid") }),
  z.object({
    mode: z.literal("glass"),
    /**
     * Softness: how far each frame's colour carries into the space around it.
     * Named for the blur it originally set; the stored range is unchanged so
     * posters saved with it still parse.
     */
    blurPercent: z.number().min(0.5).max(8),
    /** How strongly `backgroundColor` frosts the gradient. */
    tintOpacity: z.number().min(0).max(0.9)
  })
]);
export type SharingPosterBackground = z.infer<typeof sharingPosterBackgroundSchema>;

/** Values applied when an owner switches a poster to the glass background. */
export const SHARING_POSTER_GLASS_DEFAULTS = {
  blurPercent: 3,
  tintOpacity: 0.55
} as const;

export const sharingPosterCompositionSchema = z.object({
  version: z.literal(1),
  outputLocale: z.enum(["en", "zh"]),
  ratio: z.object({
    width: z.number().min(1).max(100),
    height: z.number().min(1).max(100)
  }),
  style: z.object({
    marginPercent: z.number().min(0).max(12),
    gapPercent: z.number().min(0).max(5),
    backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    footerTextPercent: z.number().min(1).max(4),
    // Both optional: a poster saved before they existed must still validate
    // (a failed parse replaces the whole poster with a default), and the
    // renderer reproduces the previous fixed spacing and solid fill when they
    // are absent.
    /** Gap between the photo area and the credits, as a percentage of width. */
    textGapPercent: z.number().min(0).max(8).optional(),
    background: sharingPosterBackgroundSchema.optional()
  }),
  photos: z
    .array(sharingPosterPhotoSchema)
    .max(SHARING_POSTER_MAX_PHOTOS)
    .refine(
      (photos) => new Set(photos.map((photo) => photo.photoId)).size === photos.length,
      "duplicate_photo"
    ),
  credits: z.object({
    cosplayer: z.string().max(2000),
    cosplayerReviewed: z.boolean(),
    photographer: z.string().max(500),
    camera: z.string().max(2000),
    lens: z.string().max(2000),
    event: z.string().max(2000),
    date: z.string().max(2000),
    location: z.string().max(2000),
    showCamera: z.boolean(),
    showLens: z.boolean(),
    showEvent: z.boolean(),
    showDate: z.boolean(),
    showLocation: z.boolean()
  }),
  export: z.object({
    format: z.enum(["jpeg", "png"]),
    longestEdge: z.number().int().min(720).max(SHARING_POSTER_MAX_EDGE)
  })
});

export type SharingPosterComposition = z.infer<
  typeof sharingPosterCompositionSchema
>;
export type SharingPosterPhoto = z.infer<typeof sharingPosterPhotoSchema>;

/** "pending" = not detected yet (or by an older algorithm); "none" = attempted, nothing found. */
export type SharingPosterSubjectState = "pending" | "detected" | "none";

export interface SharingPosterSubject {
  /** Where a crop that cannot hold the whole box centres, fractions of the image. */
  x: number;
  y: number;
  /** Approximate extent, fractions of the image, when the detector produced one. */
  box: { x: number; y: number; width: number; height: number } | null;
}

export interface SharingPosterPhotoValue {
  id: string;
  eventId: string;
  eventTitle: string;
  eventDate: string;
  eventLocation: string;
  width: number;
  height: number;
  homeWeight: number;
  thumbUrl: string;
  previewUrl: string;
  fullUrl: string;
  creditNames: string[];
  cameraModel: string;
  lensModel: string;
  subjectState: SharingPosterSubjectState;
  /** Non-null exactly when `subjectState` is "detected". */
  subject: SharingPosterSubject | null;
}

export interface SharingPosterResolvedPhoto {
  photoId: string;
  composition: SharingPosterPhoto;
  source: SharingPosterPhotoValue | null;
}

function uniqueText(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) return false;
    seen.add(trimmed);
    return true;
  });
}

export function sharingPosterMetadataFromPhotos(
  photos: SharingPosterPhotoValue[]
): Pick<SharingPosterComposition["credits"], "cosplayer" | "camera" | "lens" | "event" | "date" | "location"> {
  const seenEvents = new Set<string>();
  const events = photos.filter((photo) => {
    if (seenEvents.has(photo.eventId)) return false;
    seenEvents.add(photo.eventId);
    return true;
  });
  return {
    cosplayer: uniqueText(photos.flatMap((photo) => photo.creditNames)).join(" / "),
    camera: uniqueText(photos.map((photo) => photo.cameraModel)).join(" / "),
    lens: uniqueText(photos.map((photo) => photo.lensModel)).join(" / "),
    event: events.map((photo) => photo.eventTitle.trim()).join("\n"),
    date: events.map((photo) => photo.eventDate.trim()).join("\n"),
    location: events.map((photo) => photo.eventLocation.trim()).join("\n")
  };
}

export function defaultSharingPosterComposition(
  locale: string,
  photographer: string,
  photoIds: Array<{ id: string; homeWeight?: number }> = []
): SharingPosterComposition {
  const seen = new Set<string>();
  return {
    version: 1,
    outputLocale: locale === "zh" ? "zh" : "en",
    ratio: { width: 4, height: 5 },
    style: {
      marginPercent: 2.5,
      gapPercent: 0.65,
      backgroundColor: "#ffffff",
      textColor: "#211d18",
      footerTextPercent: 1.8,
      textGapPercent: 2.5,
      background: { mode: "solid" }
    },
    photos: photoIds
      .filter(({ id }) => id && !seen.has(id) && seen.add(id))
      .slice(0, SHARING_POSTER_MAX_PHOTOS)
      .map(({ id, homeWeight }) => ({
        photoId: id,
        weight: normalizeHomePhotoWeight(
          homeWeight ?? HOME_PHOTO_WEIGHT_FALLBACK
        ),
        focalX: 0.5,
        focalY: 0.5,
        crop: { mode: "auto" }
      })),
    credits: {
      cosplayer: "",
      cosplayerReviewed: false,
      photographer,
      camera: "",
      lens: "",
      event: "",
      date: "",
      location: "",
      showCamera: false,
      showLens: false,
      showEvent: false,
      showDate: false,
      showLocation: false
    },
    export: { format: "jpeg", longestEdge: SHARING_POSTER_DEFAULT_LONG_EDGE }
  };
}

/**
 * The frame-to-text gap a poster saved before `textGapPercent` existed
 * effectively used: the outer margin plus the footer's implicit padding, which
 * was derived from the margin and the font size. Display-only (it ignores the
 * 11 px font floor); the renderer reproduces the exact legacy geometry when
 * the field is absent.
 */
export function legacyTextGapPercent(style: {
  marginPercent: number;
  footerTextPercent: number;
}): number {
  return (
    style.marginPercent +
    Math.max(style.marginPercent * 0.8, style.footerTextPercent * 0.8)
  );
}

export function parseSharingPosterComposition(
  value: unknown,
  fallback: SharingPosterComposition
): SharingPosterComposition {
  const parsed = sharingPosterCompositionSchema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
}

export function sharingPosterPixelSize(
  composition: SharingPosterComposition
): { width: number; height: number } {
  const { width: rw, height: rh } = composition.ratio;
  const requested = composition.export.longestEdge;
  let width = rw >= rh ? requested : Math.round((requested * rw) / rh);
  let height = rh >= rw ? requested : Math.round((requested * rh) / rw);
  const pixels = width * height;
  if (pixels > SHARING_POSTER_MAX_PIXELS) {
    const scale = Math.sqrt(SHARING_POSTER_MAX_PIXELS / pixels);
    width = Math.max(1, Math.floor(width * scale));
    height = Math.max(1, Math.floor(height * scale));
  }
  return { width, height };
}

export function sharingPosterCreditLines(
  composition: SharingPosterComposition
): string[] {
  const c = composition.credits;
  const labels = composition.outputLocale === "zh"
    ? {
        cosplayer: "出镜 / CN",
        photographer: "摄影",
        camera: "相机",
        lens: "镜头",
        event: "活动",
        date: "日期",
        location: "地点"
      }
    : {
        cosplayer: "Cosplayer CN",
        photographer: "Photographer",
        camera: "Camera",
        lens: "Lens",
        event: "Event",
        date: "Date",
        location: "Location"
      };
  const lines = [
    `${labels.cosplayer}: ${c.cosplayer.trim()}`,
    `${labels.photographer}: ${c.photographer.trim()}`
  ];
  if (c.showCamera && c.camera.trim()) lines.push(`${labels.camera}: ${c.camera.trim()}`);
  if (c.showLens && c.lens.trim()) lines.push(`${labels.lens}: ${c.lens.trim()}`);
  if (c.showEvent || c.showDate || c.showLocation) {
    const eventValues = c.event.split("\n");
    const dateValues = c.date.split("\n");
    const locationValues = c.location.split("\n");
    const groupCount = Math.max(eventValues.length, dateValues.length, locationValues.length);
    for (let index = 0; index < groupCount; index += 1) {
      const parts = [
        c.showEvent && eventValues[index]?.trim()
          ? `${labels.event}: ${eventValues[index].trim()}`
          : "",
        c.showDate && dateValues[index]?.trim()
          ? `${labels.date}: ${dateValues[index].trim()}`
          : "",
        c.showLocation && locationValues[index]?.trim()
          ? `${labels.location}: ${locationValues[index].trim()}`
          : ""
      ].filter(Boolean);
      if (parts.length) lines.push(parts.join(" · "));
    }
  }
  return lines;
}
