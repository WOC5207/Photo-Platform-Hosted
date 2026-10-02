import sharp from "sharp";
import { config } from "./config";
import { GRID_EDGE, SUBJECT_DETECTION_VERSION, subjectFromGrid, type SubjectDetectionResult } from "./subjectDetectionCore";

export * from "./subjectDetectionCore";

/**
 * Server front end of the subject detector: sharp decodes and shrinks the
 * file, then the pure detector in subjectDetectionCore.ts reads the grid.
 * No database, no import of images.ts (which imports this file).
 */

const WORKING_EDGE = 512;

export async function detectSubjectFromFile(medPath: string): Promise<SubjectDetectionResult> {
  const working = await sharp(medPath, {
    failOn: "warning",
    pages: 1,
    limitInputPixels: config.imageMaxPixels()
  })
    .resize({ width: WORKING_EDGE, height: WORKING_EDGE, fit: "inside", withoutEnlargement: true })
    .toColourspace("srgb")
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return detectSubjectFromRaw(working.data, working.info.width, working.info.height, working.info.channels);
}

/** Exposed for tests that build fixtures in memory. */
export async function detectSubjectFromRaw(
  data: Buffer,
  width: number,
  height: number,
  channels: number
): Promise<SubjectDetectionResult> {
  const version = SUBJECT_DETECTION_VERSION;
  if (channels !== 3 || width < 2 || height < 2) return { version, subject: null };
  const grid = await sharp(data, { raw: { width, height, channels: 3 } })
    .resize({ width: GRID_EDGE, height: GRID_EDGE, fit: "inside" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { version, subject: subjectFromGrid(grid.data, grid.info.width, grid.info.height) };
}
