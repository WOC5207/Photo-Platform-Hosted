/**
 * The few EXIF fields a sharing poster credits (camera, lens, date taken),
 * read in the browser from a visitor's own JPEG. The server reads EXIF with
 * exif-reader, which needs Node's Buffer; this reads the same tags with a
 * DataView so nothing has to be uploaded. Best-effort: any other format, or a
 * file without EXIF, gives empty strings.
 */

export interface LocalPhotoExif {
  cameraModel: string;
  lensModel: string;
  /** YYYY-MM-DD, as the gallery prints an event's date. */
  takenDate: string;
}

const EMPTY: LocalPhotoExif = { cameraModel: "", lensModel: "", takenDate: "" };
/** Camera EXIF sits in the first APP1 segment, well inside this. */
const SCAN_BYTES = 256 * 1024;

const TAG_MAKE = 0x010f;
const TAG_MODEL = 0x0110;
const TAG_EXIF_IFD = 0x8769;
const TAG_DATE_ORIGINAL = 0x9003;
const TAG_LENS_MODEL = 0xa434;

function readAscii(view: DataView, tiff: number, entry: number, little: boolean): string {
  const count = view.getUint32(entry + 4, little);
  const start = count <= 4 ? entry + 8 : tiff + view.getUint32(entry + 8, little);
  if (start + count > view.byteLength) return "";
  let text = "";
  for (let i = 0; i < count; i += 1) {
    const code = view.getUint8(start + i);
    if (code === 0) break;
    text += String.fromCharCode(code);
  }
  return text.trim();
}

function readIfd(view: DataView, tiff: number, offset: number, little: boolean): Map<number, number> {
  const entries = new Map<number, number>();
  const at = tiff + offset;
  if (at + 2 > view.byteLength) return entries;
  const count = view.getUint16(at, little);
  for (let i = 0; i < count; i += 1) {
    const entry = at + 2 + i * 12;
    if (entry + 12 > view.byteLength) break;
    entries.set(view.getUint16(entry, little), entry);
  }
  return entries;
}

export function parseJpegExif(buffer: ArrayBuffer): LocalPhotoExif {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return EMPTY;
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset);
    const length = view.getUint16(offset + 2);
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) return EMPTY;
    // "Exif\0\0" then a TIFF header.
    if (marker === 0xffe1 && offset + 10 <= view.byteLength && view.getUint32(offset + 4) === 0x45786966 && view.getUint16(offset + 8) === 0) {
      const tiff = offset + 10;
      if (tiff + 8 > view.byteLength) return EMPTY;
      const order = view.getUint16(tiff);
      if (order !== 0x4949 && order !== 0x4d4d) return EMPTY;
      const little = order === 0x4949;
      const ifd0 = readIfd(view, tiff, view.getUint32(tiff + 4, little), little);
      const ascii = (ifd: Map<number, number>, tag: number) => {
        const entry = ifd.get(tag);
        return entry === undefined ? "" : readAscii(view, tiff, entry, little);
      };
      const exifEntry = ifd0.get(TAG_EXIF_IFD);
      const exif = exifEntry === undefined ? new Map<number, number>() : readIfd(view, tiff, view.getUint32(exifEntry + 8, little), little);
      const make = ascii(ifd0, TAG_MAKE);
      const model = ascii(ifd0, TAG_MODEL);
      // As on the server: many bodies repeat the make inside the model.
      const cameraModel =
        model && (!make || model.toLowerCase().startsWith(make.toLowerCase()))
          ? model
          : [make, model].filter(Boolean).join(" ");
      const date = /^(\d{4}):(\d{2}):(\d{2})/.exec(ascii(exif, TAG_DATE_ORIGINAL));
      return {
        cameraModel,
        lensModel: ascii(exif, TAG_LENS_MODEL),
        takenDate: date ? `${date[1]}-${date[2]}-${date[3]}` : ""
      };
    }
    offset += 2 + length;
  }
  return EMPTY;
}

export async function readLocalPhotoExif(file: Blob): Promise<LocalPhotoExif> {
  try {
    return parseJpegExif(await file.slice(0, SCAN_BYTES).arrayBuffer());
  } catch {
    return EMPTY;
  }
}
