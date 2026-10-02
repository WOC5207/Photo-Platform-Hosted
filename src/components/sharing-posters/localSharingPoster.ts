import {
  SHARING_POSTER_LAYER_TOKEN,
  parseSharingPosterComposition,
  registerLocalSharingPosterLayer,
  type SharingPosterComposition,
  type SharingPosterPhotoValue,
  type SharingPosterResolvedPhoto,
  type SharingPosterSubject
} from "@/lib/sharingPoster";
import { GRID_EDGE, subjectFromGrid } from "@/lib/subjectDetectionCore";
import { readLocalPhotoExif } from "@/lib/localPhotoExif";

/**
 * The public sharing poster editor keeps everything in the visitor's browser:
 * their photographs and layer images are decoded, measured and drawn here,
 * and the draft is kept in IndexedDB, like the Cosplan creator's. Nothing is
 * uploaded to the server.
 */

const DB_NAME = "pinhaoshe-sharing-poster";
const DRAFT_STORE = "draft";
const PHOTO_STORE = "photos";
const LAYER_STORE = "layers";
const DRAFT_KEY = "current";
const THUMB_EDGE = 480;
/** What the preview draws; the export reads the original file. */
const PREVIEW_EDGE = 2048;
/** Layer images are kept at most this size, as the dashboard stores them. */
const LAYER_EDGE = 4096;

/** A visitor's photograph as it is kept in the browser. */
export interface LocalPhotoRecord {
  id: string;
  file: Blob;
  width: number;
  height: number;
  subject: SharingPosterSubject | null;
  cameraModel: string;
  lensModel: string;
  takenDate: string;
}

interface LocalLayerRecord {
  token: string;
  file: Blob;
}

export interface LocalPosterDraft {
  name: string;
  composition: SharingPosterComposition;
}

function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (value) => value.toString(16).padStart(2, "0")).join("");
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(DRAFT_STORE);
      request.result.createObjectStore(PHOTO_STORE, { keyPath: "id" });
      request.result.createObjectStore(LAYER_STORE, { keyPath: "token" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStores<T>(
  stores: string[],
  mode: IDBTransactionMode,
  run: (transaction: IDBTransaction) => Promise<T> | T
): Promise<T> {
  const db = await openDb();
  try {
    const transaction = db.transaction(stores, mode);
    const done = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    const result = await run(transaction);
    await done;
    return result;
  } finally {
    db.close();
  }
}

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error);
  });
}

export function saveLocalPosterDraft(draft: LocalPosterDraft): Promise<void> {
  return withStores([DRAFT_STORE], "readwrite", (transaction) => {
    transaction.objectStore(DRAFT_STORE).put(draft, DRAFT_KEY);
  });
}

export function storeLocalPhoto(record: LocalPhotoRecord): Promise<void> {
  return withStores([PHOTO_STORE], "readwrite", (transaction) => {
    transaction.objectStore(PHOTO_STORE).put(record);
  });
}

function storeLocalLayer(record: LocalLayerRecord): Promise<void> {
  return withStores([LAYER_STORE], "readwrite", (transaction) => {
    transaction.objectStore(LAYER_STORE).put(record);
  });
}

export function clearLocalPosterDraft(): Promise<void> {
  return withStores([DRAFT_STORE, PHOTO_STORE, LAYER_STORE], "readwrite", (transaction) => {
    for (const store of [DRAFT_STORE, PHOTO_STORE, LAYER_STORE]) transaction.objectStore(store).clear();
  });
}

/**
 * The saved draft with its photographs and layer images ready to show. Files
 * the draft no longer uses are dropped here rather than when saving, so a
 * save racing an addition can never delete what was just added.
 */
export async function readLocalPosterDraft(fallback: SharingPosterComposition): Promise<{
  name: string;
  composition: SharingPosterComposition;
  photos: SharingPosterResolvedPhoto[];
} | null> {
  const stored = await withStores([DRAFT_STORE, PHOTO_STORE, LAYER_STORE], "readwrite", async (transaction) => {
    const [draft, photos, layers] = await Promise.all([
      request(transaction.objectStore(DRAFT_STORE).get(DRAFT_KEY)) as Promise<LocalPosterDraft | undefined>,
      request(transaction.objectStore(PHOTO_STORE).getAll()) as Promise<LocalPhotoRecord[]>,
      request(transaction.objectStore(LAYER_STORE).getAll()) as Promise<LocalLayerRecord[]>
    ]);
    if (!draft) return null;
    const composition = parseSharingPosterComposition(draft.composition, fallback);
    const usedPhotos = new Set(composition.photos.map((photo) => photo.photoId));
    const usedLayers = new Set((composition.layers ?? []).map((layer) => layer.token));
    for (const photo of photos) if (!usedPhotos.has(photo.id)) transaction.objectStore(PHOTO_STORE).delete(photo.id);
    for (const layer of layers) if (!usedLayers.has(layer.token)) transaction.objectStore(LAYER_STORE).delete(layer.token);
    return {
      name: typeof draft.name === "string" ? draft.name : "",
      composition,
      photos: photos.filter((photo) => usedPhotos.has(photo.id)),
      layers: layers.filter((layer) => usedLayers.has(layer.token))
    };
  });
  if (!stored) return null;

  for (const layer of stored.layers) registerLocalSharingPosterLayer(layer.token, URL.createObjectURL(layer.file));
  const sources = new Map<string, SharingPosterPhotoValue>();
  for (const record of stored.photos) {
    try {
      sources.set(record.id, await localPhotoValue(record));
    } catch {
      // A photograph the browser can no longer decode is left out.
    }
  }
  const presentLayers = new Set(stored.layers.map((layer) => layer.token));
  const composition: SharingPosterComposition = {
    ...stored.composition,
    photos: stored.composition.photos.filter((photo) => sources.has(photo.photoId)),
    layers: stored.composition.layers?.filter((layer) => presentLayers.has(layer.token))
  };
  return {
    name: stored.name,
    composition,
    photos: composition.photos.map((photo) => ({
      photoId: photo.photoId,
      composition: photo,
      source: sources.get(photo.photoId) ?? null
    }))
  };
}

function scaledCanvas(image: ImageBitmap, edge: number): HTMLCanvasElement {
  const scale = Math.min(1, edge / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas_failed");
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function canvasUrl(canvas: HTMLCanvasElement, type = "image/jpeg"): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(URL.createObjectURL(blob)) : reject(new Error("encode_failed"))), type, 0.9);
  });
}

/**
 * The same detector the server runs on gallery photographs, fed a grid the
 * browser shrank instead of sharp. Its grid is at most GRID_EDGE on its long
 * side, as on the server.
 */
function detectSubject(source: HTMLCanvasElement): SharingPosterSubject | null {
  const scale = Math.min(1, GRID_EDGE / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, width, height);
  const rgba = context.getImageData(0, 0, width, height).data;
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    rgb[j] = rgba[i];
    rgb[j + 1] = rgba[i + 1];
    rgb[j + 2] = rgba[i + 2];
  }
  return subjectFromGrid(rgb, width, height);
}

/** Thumbnail and preview renditions of a stored photograph, as the editor reads gallery ones. */
async function localPhotoValue(record: LocalPhotoRecord): Promise<SharingPosterPhotoValue> {
  const bitmap = await createImageBitmap(record.file);
  try {
    const [thumbUrl, previewUrl] = await Promise.all([
      canvasUrl(scaledCanvas(bitmap, THUMB_EDGE)),
      canvasUrl(scaledCanvas(bitmap, PREVIEW_EDGE))
    ]);
    return valueFromRecord(record, thumbUrl, previewUrl);
  } finally {
    bitmap.close();
  }
}

function valueFromRecord(record: LocalPhotoRecord, thumbUrl: string, previewUrl: string): SharingPosterPhotoValue {
  return {
    id: record.id,
    // Each photograph is its own "event", so its date prints once per day it was taken.
    eventId: record.takenDate || record.id,
    eventTitle: "",
    eventDate: record.takenDate,
    eventLocation: "",
    width: record.width,
    height: record.height,
    homeWeight: 3,
    thumbUrl,
    previewUrl,
    fullUrl: URL.createObjectURL(record.file),
    creditNames: [],
    cameraModel: record.cameraModel,
    lensModel: record.lensModel,
    subjectState: record.subject ? "detected" : "none",
    subject: record.subject
  };
}

/** Read a visitor's photograph, find its subject, and keep it in the browser. */
export async function addLocalPhoto(file: File): Promise<SharingPosterPhotoValue> {
  const bitmap = await createImageBitmap(file);
  try {
    const preview = scaledCanvas(bitmap, PREVIEW_EDGE);
    const [exif, thumbUrl, previewUrl] = await Promise.all([
      readLocalPhotoExif(file),
      canvasUrl(scaledCanvas(bitmap, THUMB_EDGE)),
      canvasUrl(preview)
    ]);
    const record: LocalPhotoRecord = {
      id: `local-${randomHex(12)}`,
      file,
      width: bitmap.width,
      height: bitmap.height,
      subject: detectSubject(preview),
      ...exif
    };
    // Kept best-effort: a browser without room still edits, it just cannot restore.
    await storeLocalPhoto(record).catch(() => {});
    return valueFromRecord(record, thumbUrl, previewUrl);
  } finally {
    bitmap.close();
  }
}

/** Read a layer image in the browser; oversized ones are scaled down, keeping transparency. */
export async function addLocalLayer(file: File): Promise<{ token: string; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  try {
    let blob: Blob = file;
    let { width, height } = bitmap;
    if (Math.max(width, height) > LAYER_EDGE) {
      const canvas = scaledCanvas(bitmap, LAYER_EDGE);
      blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("encode_failed"))), "image/png")
      );
      ({ width, height } = canvas);
    }
    const token = `posterlayer${randomHex(16)}`;
    if (!SHARING_POSTER_LAYER_TOKEN.test(token)) throw new Error("token_failed");
    registerLocalSharingPosterLayer(token, URL.createObjectURL(blob));
    await storeLocalLayer({ token, file: blob }).catch(() => {});
    return { token, width, height };
  } finally {
    bitmap.close();
  }
}
