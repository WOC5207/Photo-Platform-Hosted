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
export const SHARING_POSTER_CREDIT_LABEL_MAX = 80;

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

/**
 * What a credit line says: a person, the gear, or event details, printed as
 * "Title: value"; or "custom", the owner's own text printed as it is.
 */
export const SHARING_POSTER_CREDIT_KINDS = [
  "cosplayer",
  "photographer",
  "equipment",
  "event",
  "date",
  "location",
  "custom"
] as const;
export type SharingPosterCreditKind = (typeof SHARING_POSTER_CREDIT_KINDS)[number];
/** Kinds whose value comes from the selected photographs' gallery metadata. */
export const SHARING_POSTER_METADATA_KINDS: readonly SharingPosterCreditKind[] = [
  "cosplayer",
  "equipment",
  "event",
  "date",
  "location"
];
export const SHARING_POSTER_MAX_CREDIT_LINES = 20;

export const sharingPosterCreditLineSchema = z.object({
  id: z.string().min(1).max(40),
  kind: z.enum(SHARING_POSTER_CREDIT_KINDS),
  /** The owner's title for this line; absent or blank prints the locale's. Custom lines have none. */
  label: z.string().max(SHARING_POSTER_CREDIT_LABEL_MAX).optional(),
  value: z.string().max(2000)
});
export type SharingPosterCreditLine = z.infer<typeof sharingPosterCreditLineSchema>;

/** Version 1 credits: fixed fields, kept only to migrate saved projects. */
const legacyCreditsSchema = z.object({
  cosplayer: z.string().max(2000),
  cosplayerLabel: z.string().max(SHARING_POSTER_CREDIT_LABEL_MAX).optional(),
  cosplayerReviewed: z.boolean(),
  photographer: z.string().max(500),
  photographerLabel: z.string().max(SHARING_POSTER_CREDIT_LABEL_MAX).optional(),
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
});

const compositionBaseSchema = z.object({
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
  export: z.object({
    format: z.enum(["jpeg", "png"]),
    longestEdge: z.number().int().min(720).max(SHARING_POSTER_MAX_EDGE)
  })
});

const compositionSchemaV2 = compositionBaseSchema.extend({
  version: z.literal(2),
  credits: z.object({
    /** The footer's lines, printed top to bottom as the editor's layers list shows them. */
    lines: z
      .array(sharingPosterCreditLineSchema)
      .max(SHARING_POSTER_MAX_CREDIT_LINES)
      .refine((lines) => new Set(lines.map((line) => line.id)).size === lines.length, "duplicate_line"),
    /** The owner has checked the shared CN although some photographs have none. */
    cosplayerReviewed: z.boolean()
  })
});

const compositionSchemaV1 = compositionBaseSchema.extend({
  version: z.literal(1),
  credits: legacyCreditsSchema
});

/**
 * Accepts the current version and migrates version 1 on the way in, so a
 * project saved before credit lines existed opens, renders and saves as
 * version 2. Every reader parses through here: a composition that failed to
 * parse would be replaced by a default, losing the owner's work.
 */
export const sharingPosterCompositionSchema = z.union([
  compositionSchemaV2,
  compositionSchemaV1.transform(({ credits, ...rest }) => ({
    ...rest,
    version: 2 as const,
    credits: {
      lines: creditLinesFromLegacy(credits),
      cosplayerReviewed: credits.cosplayerReviewed
    }
  }))
]);

export type SharingPosterComposition = z.infer<typeof compositionSchemaV2>;
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

/** Gallery details of the selected photographs; event, date and location hold one entry per event. */
export interface SharingPosterMetadata {
  cosplayer: string;
  camera: string;
  lens: string;
  event: string;
  date: string;
  location: string;
}

export function sharingPosterMetadataFromPhotos(
  photos: SharingPosterPhotoValue[]
): SharingPosterMetadata {
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
    version: 2,
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
    // The two lines almost every poster carries; both can be removed.
    credits: {
      lines: [
        { id: "cosplayer", kind: "cosplayer", value: "" },
        { id: "photographer", kind: "photographer", value: photographer }
      ],
      cosplayerReviewed: false
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

export type SharingPosterTitledKind = Exclude<SharingPosterCreditKind, "custom">;

/** The titles a poster prints before each kind of line, in its output language. */
export function sharingPosterCreditLabels(
  outputLocale: SharingPosterComposition["outputLocale"]
): Record<SharingPosterTitledKind, string> {
  return outputLocale === "zh"
    ? {
        cosplayer: "出镜 / CN",
        photographer: "摄影",
        equipment: "器材",
        event: "活动",
        date: "日期",
        location: "地点"
      }
    : {
        cosplayer: "Cosplayer CN",
        photographer: "Photographer",
        equipment: "Equipment",
        event: "Event",
        date: "Date",
        location: "Location"
      };
}

/** A value as one printed line: its lines joined by " / ", runs of spaces collapsed. */
function oneLine(value: string): string {
  return value
    .split("\n")
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" / ");
}

/**
 * The gallery's value for a line of this kind, or null for kinds the gallery
 * does not know (the photographer is the owner, custom text is the owner's).
 * Equipment is the body and lens together; events contribute one entry each.
 */
export function sharingPosterCreditMetadataValue(
  kind: SharingPosterCreditKind,
  metadata: SharingPosterMetadata
): string | null {
  switch (kind) {
    case "cosplayer":
      return metadata.cosplayer;
    case "equipment":
      return [metadata.camera, metadata.lens].map((part) => part.trim()).filter(Boolean).join(" + ");
    case "event":
    case "date":
    case "location":
      return uniqueText(metadata[kind].split("\n")).map((part) => part.trim()).join(" / ");
    default:
      return null;
  }
}

/** Refills every gallery-derived line from fresh metadata; the owner's own lines stay as they are. */
export function withSharingPosterMetadata(
  lines: SharingPosterCreditLine[],
  metadata: SharingPosterMetadata
): SharingPosterCreditLine[] {
  return lines.map((line) => {
    const value = sharingPosterCreditMetadataValue(line.kind, metadata);
    return value === null ? line : { ...line, value };
  });
}

/** The lines with `id` moved to `index` (clamped); the same array when nothing moves. */
export function moveSharingPosterCreditLine(
  lines: SharingPosterCreditLine[],
  id: string,
  index: number
): SharingPosterCreditLine[] {
  const from = lines.findIndex((line) => line.id === id);
  const to = Math.min(lines.length - 1, Math.max(0, index));
  if (from < 0 || from === to) return lines;
  const next = [...lines];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Version 1's fixed fields as lines, in the order it printed them. Hidden
 * details were never printed, so they are dropped; camera and lens become one
 * equipment line, and each event detail its own line.
 */
function creditLinesFromLegacy(credits: z.infer<typeof legacyCreditsSchema>): SharingPosterCreditLine[] {
  const line = (kind: SharingPosterCreditKind, value: string, label?: string): SharingPosterCreditLine =>
    label === undefined ? { id: kind, kind, value } : { id: kind, kind, label, value };
  const lines = [
    line("cosplayer", credits.cosplayer, credits.cosplayerLabel),
    line("photographer", credits.photographer, credits.photographerLabel)
  ];
  const equipment = [credits.showCamera ? credits.camera : "", credits.showLens ? credits.lens : ""]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" + ");
  if (equipment) lines.push(line("equipment", equipment));
  const shown = { event: credits.showEvent, date: credits.showDate, location: credits.showLocation };
  for (const kind of ["event", "date", "location"] as const) {
    const value = oneLine(credits[kind]);
    if (shown[kind] && value) lines.push(line(kind, value));
  }
  return lines;
}

/**
 * The owner's title for a credit line, on one line and without the trailing
 * colon the line adds itself; blank falls back to the locale's title.
 */
export function sharingPosterCreditLabel(custom: string | undefined, fallback: string): string {
  const cleaned = (custom ?? "").replace(/\s+/g, " ").trim().replace(/[:：]+$/u, "").trim();
  return cleaned || fallback;
}

/**
 * The footer's text, one entry per line in layer order. Empty lines are
 * skipped, as an empty text layer draws nothing.
 */
export function sharingPosterCreditLines(
  composition: SharingPosterComposition
): string[] {
  const labels = sharingPosterCreditLabels(composition.outputLocale);
  return composition.credits.lines.flatMap((line) => {
    const value = oneLine(line.value);
    if (!value) return [];
    if (line.kind === "custom") return [value];
    return [`${sharingPosterCreditLabel(line.label, labels[line.kind])}: ${value}`];
  });
}
