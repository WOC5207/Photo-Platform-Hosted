import "server-only";
import path from "node:path";
import { open, type FileHandle } from "node:fs/promises";
import { Readable } from "node:stream";
import { crc32 } from "node:zlib";
import sharp from "sharp";
import { config } from "./config";
import { eventDir, withPublicDownloadSlot } from "./images";

/**
 * A photo's stored master as a visitor may download it: full resolution, with
 * the camera's metadata (EXIF and GPS, XMP, IPTC, comments, maker data and
 * any images appended after the main one) taken out.
 *
 * JPEG, PNG and WebP masters are stripped losslessly while they are sent: the
 * response copies the master's image segments byte for byte and skips the
 * metadata ones, so nothing is written to disk and no pixels are re-encoded.
 * Only the orientation survives, as a minimal EXIF block, so the photo still
 * opens upright. TIFF keeps its metadata in the image's own directory, so a
 * TIFF master (and any master the parser can't follow) is re-encoded on the
 * fly instead, one at a time, and never cached.
 */
export interface OriginalDownload {
  ext: string;
  size: number;
  body(): ReadableStream<Uint8Array>;
}

/** A byte range [start, end) of the master, or bytes sent in its place. */
type Part = Buffer | { start: number; end: number };

const CHUNK = 256 * 1024;
/** Longest a re-encode keeps its slot while a slow client reads it. */
const SEND_HOLD_MS = 60_000;

export async function originalDownload(
  ownerId: string,
  eventId: string,
  filename: string
): Promise<OriginalDownload> {
  const filePath = path.join(eventDir(ownerId, eventId), filename);
  const ext = path.extname(filename).slice(1).toLowerCase();
  if (ext === "tif" || ext === "tiff") return reencoded(filePath, ext);

  const meta = await sharp(filePath, { limitInputPixels: config.imageMaxPixels(), pages: 1 }).metadata();
  const orientation = Number.isInteger(meta.orientation) && meta.orientation! >= 2 && meta.orientation! <= 8 ? meta.orientation! : 1;
  const fh = await open(filePath, "r");
  let parts: Part[] | null;
  let stat: { size: number; mtimeMs: number };
  try {
    stat = await fh.stat();
    const src = new FileBytes(fh, stat.size);
    parts =
      ext === "png"
        ? await pngParts(src, orientation)
        : ext === "webp"
          ? await webpParts(src, orientation)
          : await jpegParts(src, orientation);
  } finally {
    await fh.close();
  }
  if (!parts) return reencoded(filePath, ext);
  const plan = parts;
  return {
    ext,
    size: plan.reduce((sum, part) => sum + (Buffer.isBuffer(part) ? part.length : part.end - part.start), 0),
    body: () => partsStream(filePath, plan, stat)
  };
}

/** Positional reads through one cached window, for walking a file's segments. */
class FileBytes {
  private window = Buffer.alloc(0);
  private windowStart = 0;

  constructor(
    private readonly fh: FileHandle,
    readonly size: number
  ) {}

  /** Up to len bytes from pos; fewer only at the end of the file. */
  async at(pos: number, len: number): Promise<Buffer> {
    const offset = pos - this.windowStart;
    if (offset >= 0 && offset + len <= this.window.length) return this.window.subarray(offset, offset + len);
    const buf = Buffer.alloc(Math.max(0, Math.min(Math.max(len, CHUNK), this.size - pos)));
    const { bytesRead } = await this.fh.read(buf, 0, buf.length, pos);
    this.window = buf.subarray(0, bytesRead);
    this.windowStart = pos;
    return this.window.subarray(0, Math.min(len, bytesRead));
  }
}

/** A big-endian TIFF block whose one tag is the orientation. */
function orientationTiff(orientation: number): Buffer {
  return Buffer.from([
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // "MM", 42, first IFD at 8
    0x00, 0x01, // one entry
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00, // Orientation, SHORT, 1
    0x00, 0x00, 0x00, 0x00 // no next IFD
  ]);
}

async function startsWith(src: FileBytes, pos: number, text: string): Promise<boolean> {
  return (await src.at(pos, text.length)).toString("latin1") === text;
}

/**
 * Keeps the segments a decoder needs (frame, tables, scans, restart intervals),
 * the JFIF header, the colour profile and Adobe's colour-transform flag. Drops
 * every other APPn and comment, and stops at the first end-of-image, which
 * also drops Multi-Picture images (each with its own EXIF) appended after it.
 */
async function jpegParts(src: FileBytes, orientation: number): Promise<Part[] | null> {
  const soi = await src.at(0, 2);
  if (soi.length < 2 || soi[0] !== 0xff || soi[1] !== 0xd8) return null;
  const parts: Part[] = [{ start: 0, end: 2 }];
  let orientationAt = 1;
  let pos = 2;
  while (pos < src.size) {
    const head = await src.at(pos, 4);
    if (head.length < 2 || head[0] !== 0xff) return null;
    const marker = head[1];
    if (marker === 0xff) {
      pos += 1; // fill byte
      continue;
    }
    if (marker === 0xd9) {
      parts.push({ start: pos, end: pos + 2 });
      break;
    }
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      parts.push({ start: pos, end: pos + 2 });
      pos += 2;
      continue;
    }
    if (head.length < 4) return null;
    const end = pos + 2 + head.readUInt16BE(2);
    if (end < pos + 4 || end > src.size) return null;
    if (marker === 0xda) {
      const scanEnd = await entropyEnd(src, end);
      parts.push({ start: pos, end: scanEnd });
      pos = scanEnd;
      continue;
    }
    const payload = pos + 4;
    const keep =
      marker === 0xe0
        ? (await startsWith(src, payload, "JFIF\0")) || (await startsWith(src, payload, "JFXX\0"))
        : marker === 0xe2
          ? await startsWith(src, payload, "ICC_PROFILE\0")
          : marker === 0xee
            ? await startsWith(src, payload, "Adobe")
            : !((marker >= 0xe1 && marker <= 0xef) || marker === 0xfe);
    if (keep) {
      parts.push({ start: pos, end });
      // EXIF goes straight after SOI, or after a JFIF header that leads.
      if (marker === 0xe0 && parts.length === 2) orientationAt = 2;
    }
    pos = end;
  }
  if (orientation > 1) {
    const tiff = orientationTiff(orientation);
    const app1 = Buffer.alloc(4 + 6 + tiff.length);
    app1.writeUInt16BE(0xffe1, 0);
    app1.writeUInt16BE(2 + 6 + tiff.length, 2);
    app1.write("Exif\0\0", 4, "latin1");
    tiff.copy(app1, 10);
    parts.splice(orientationAt, 0, app1);
  }
  return parts;
}

/** Where a scan's entropy-coded data ends: the next marker that isn't stuffing or a restart. */
async function entropyEnd(src: FileBytes, from: number): Promise<number> {
  let pos = from;
  while (pos < src.size) {
    const chunk = await src.at(pos, CHUNK);
    let i = chunk.indexOf(0xff);
    while (i !== -1 && i + 1 < chunk.length) {
      const next = chunk[i + 1];
      if (next !== 0x00 && next !== 0xff && (next < 0xd0 || next > 0xd7)) return pos + i;
      i = chunk.indexOf(0xff, i + 1);
    }
    if (i === -1) {
      pos += chunk.length;
    } else {
      // A 0xFF at the window's edge: read on from it to see what follows.
      if (pos + i + 1 >= src.size) return src.size;
      pos += i;
    }
  }
  return src.size;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** Metadata chunks: EXIF, the text chunks (XMP lives in iTXt) and the edit time. */
const PNG_METADATA = new Set(["eXIf", "exIf", "tEXt", "zTXt", "iTXt", "tIME"]);

function pngChunk(type: string, data: Buffer): Buffer {
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, "latin1");
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + data.length)), 8 + data.length);
  return chunk;
}

async function pngParts(src: FileBytes, orientation: number): Promise<Part[] | null> {
  if (!(await src.at(0, 8)).equals(PNG_SIGNATURE)) return null;
  const parts: Part[] = [{ start: 0, end: 8 }];
  let pos = 8;
  while (pos + 12 <= src.size) {
    const head = await src.at(pos, 8);
    const type = head.toString("latin1", 4, 8);
    const end = pos + 12 + head.readUInt32BE(0);
    if (end > src.size) return null;
    if (!PNG_METADATA.has(type)) parts.push({ start: pos, end });
    // eXIf must come before the image data; IHDR is always first.
    if (type === "IHDR" && orientation > 1) parts.push(pngChunk("eXIf", orientationTiff(orientation)));
    if (type === "IEND") return parts;
    pos = end;
  }
  return null;
}

async function webpParts(src: FileBytes, orientation: number): Promise<Part[] | null> {
  const riff = await src.at(0, 12);
  if (riff.length < 12 || riff.toString("latin1", 0, 4) !== "RIFF" || riff.toString("latin1", 8, 12) !== "WEBP") return null;
  const riffEnd = Math.min(8 + riff.readUInt32LE(4), src.size);
  const chunks: Part[] = [];
  let vp8x: Buffer | null = null;
  let pos = 12;
  while (pos + 8 <= riffEnd) {
    const head = await src.at(pos, 8);
    const fourcc = head.toString("latin1", 0, 4);
    const size = head.readUInt32LE(4);
    if (pos + 8 + size > riffEnd) return null;
    const end = Math.min(pos + 8 + size + (size & 1), riffEnd);
    if (fourcc === "VP8X" && pos === 12 && size >= 10) {
      vp8x = Buffer.from(await src.at(pos, end - pos));
      chunks.push(vp8x);
    } else if (fourcc !== "EXIF" && fourcc !== "XMP ") {
      chunks.push({ start: pos, end });
    }
    pos = end;
  }
  if (orientation > 1) {
    // Only the extended format has room for EXIF.
    if (!vp8x) return null;
    const tiff = orientationTiff(orientation);
    const exif = Buffer.alloc(8 + tiff.length + (tiff.length & 1));
    exif.write("EXIF", 0, "latin1");
    exif.writeUInt32LE(tiff.length, 4);
    tiff.copy(exif, 8);
    chunks.push(exif);
  }
  // VP8X flags: 0x08 EXIF, 0x04 XMP.
  if (vp8x) vp8x[8] = (vp8x[8] & ~0x0c) | (orientation > 1 ? 0x08 : 0);
  const length = chunks.reduce((sum, part) => sum + (Buffer.isBuffer(part) ? part.length : part.end - part.start), 0);
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "latin1");
  header.writeUInt32LE(4 + length, 4);
  header.write("WEBP", 8, "latin1");
  return [header, ...chunks];
}

/** Streams the parts, reading ranges from the master as the client takes them. */
function partsStream(filePath: string, parts: Part[], planned: { size: number; mtimeMs: number }): ReadableStream<Uint8Array> {
  async function* chunks() {
    const fh = await open(filePath, "r");
    try {
      const now = await fh.stat();
      if (now.size !== planned.size || now.mtimeMs !== planned.mtimeMs) throw new Error("The master changed before it was sent");
      for (const part of parts) {
        if (Buffer.isBuffer(part)) {
          yield part;
          continue;
        }
        for (let pos = part.start; pos < part.end; ) {
          const buf = Buffer.allocUnsafe(Math.min(CHUNK, part.end - pos));
          const { bytesRead } = await fh.read(buf, 0, buf.length, pos);
          if (bytesRead === 0) throw new Error("The master shrank while it was sent");
          yield buf.subarray(0, bytesRead);
          pos += bytesRead;
        }
      }
    } finally {
      await fh.close();
    }
  }
  return Readable.toWeb(Readable.from(chunks())) as ReadableStream<Uint8Array>;
}

/**
 * Re-encodes the master without metadata, upright and with its colour
 * profile, in the public download slot. The slot is held until the response
 * has been read (or SEND_HOLD_MS passes), so slow clients can't stack
 * full-size copies up in memory; when the slot's queue is full this throws
 * ProcessingQueueFullError.
 */
async function reencoded(filePath: string, ext: string): Promise<OriginalDownload> {
  let sent!: () => void;
  const done = new Promise<void>((resolve) => (sent = resolve));
  const buffer = await new Promise<Buffer>((resolve, reject) => {
    withPublicDownloadSlot(async () => {
      const pipeline = sharp(filePath, { limitInputPixels: config.imageMaxPixels(), pages: 1 }).rotate().keepIccProfile();
      let out: Buffer;
      try {
        if (ext === "png") out = await pipeline.png().toBuffer();
        else if (ext === "webp") out = await pipeline.webp({ quality: 100 }).toBuffer();
        else if (ext === "tif" || ext === "tiff") out = await pipeline.tiff({ compression: "lzw" }).toBuffer();
        else out = await pipeline.jpeg({ quality: 100, chromaSubsampling: "4:4:4" }).toBuffer();
      } catch (error) {
        reject(error);
        return;
      }
      resolve(out);
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([done, new Promise<void>((resolve) => (timer = setTimeout(resolve, SEND_HOLD_MS)))]);
      clearTimeout(timer);
    }).catch(reject);
  });
  return {
    ext,
    size: buffer.length,
    body: () => {
      // In slices, so the slot frees when the client has nearly read it all
      // rather than as soon as the stream has queued it.
      async function* slices() {
        try {
          for (let pos = 0; pos < buffer.length; pos += CHUNK) yield buffer.subarray(pos, pos + CHUNK);
        } finally {
          sent();
        }
      }
      return Readable.toWeb(Readable.from(slices())) as ReadableStream<Uint8Array>;
    }
  };
}
