/**
 * Original downloads: what a visitor saves from the 360° view must be the
 * master's own pixels with none of its metadata, and nothing may be left on
 * disk afterwards.
 */
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { crc32 } from "node:zlib";
import sharp from "sharp";
import { eventDir, sweepDownloadCopies } from "../src/lib/images";
import { originalDownload } from "../src/lib/originalDownload";

const ownerId = "download-owner";
const eventId = "download-event";
const SECRET = "SECRET-METADATA";

const exif = {
  IFD0: { Make: `${SECRET}-make`, Model: `${SECRET}-model`, Artist: `${SECRET}-artist` },
  IFD3: { GPSLatitudeRef: "N", GPSLatitude: "43/1 28/1 0/1", GPSLongitudeRef: "W", GPSLongitude: "80/1 31/1 0/1" }
};
const xmp = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>${SECRET}-xmp</dc:creator></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;

function base() {
  // Noise, so a re-encode would show up as changed pixels.
  const width = 320;
  const height = 200;
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < raw.length; i += 1) raw[i] = (i * 2654435761) >>> 24;
  return sharp(raw, { raw: { width, height, channels: 3 } });
}

async function read(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function pixels(input: Buffer): Promise<Buffer> {
  return sharp(input).raw().toBuffer();
}

async function download(filename: string, bytes: Buffer, tagged = true) {
  if (tagged) assert.ok(bytes.includes(SECRET), `${filename}: the test master carries metadata text`);
  await fs.writeFile(path.join(eventDir(ownerId, eventId), filename), bytes);
  const file = await originalDownload(ownerId, eventId, filename);
  const body = await read(file.body());
  assert.equal(body.length, file.size, `${filename}: Content-Length matches the body`);
  assert.equal(body.includes(SECRET), false, `${filename}: no metadata text survives`);
  return { file, body, meta: await sharp(body).metadata() };
}

function jpegComment(text: string): Buffer {
  const com = Buffer.alloc(4 + text.length);
  com.writeUInt16BE(0xfffe, 0);
  com.writeUInt16BE(2 + text.length, 2);
  com.write(text, 4, "latin1");
  return com;
}

function pngText(keyword: string, text: string): Buffer {
  const data = Buffer.from(`${keyword}\0${text}`, "latin1");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write("tEXt", 4, "latin1");
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + data.length)), 8 + data.length);
  return chunk;
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "photo-download-"));
  process.env.PHOTOS_DIR = root;
  const dir = eventDir(ownerId, eventId);
  await fs.mkdir(dir, { recursive: true });

  try {
    // A JPEG with EXIF and GPS, XMP, a colour profile, a comment, and a
    // second image (as Multi-Picture files carry) after the end of the first.
    {
      const plain = await base().jpeg({ quality: 90 }).withIccProfile("p3").toBuffer();
      const tagged = await base().jpeg({ quality: 90 }).withIccProfile("p3").withExif(exif).withXmp(xmp).toBuffer();
      const trailer = Buffer.concat([Buffer.from([0xff, 0xd8]), jpegComment(`${SECRET}-second-image`), Buffer.from([0xff, 0xd9])]);
      const master = Buffer.concat([tagged.subarray(0, 2), jpegComment(`${SECRET}-comment`), tagged.subarray(2), trailer]);
      const before = await sharp(master).metadata();
      assert.ok(before.exif && before.xmp && before.icc, "the test master carries EXIF, XMP and a profile");

      const { file, body, meta } = await download("jpeg-orig.jpg", master);
      assert.equal(file.ext, "jpg");
      assert.equal(meta.xmp, undefined, "XMP is gone");
      assert.equal(meta.exif, undefined, "EXIF is gone when the photo is upright");
      assert.ok(meta.icc, "the colour profile stays");
      assert.ok((await pixels(body)).equals(await pixels(master)), "pixels are untouched");
      assert.ok(body.equals(plain), "the result is the same JPEG written without metadata");
    }

    // Orientation survives as the only EXIF tag.
    {
      const master = await base().jpeg({ quality: 90, progressive: true }).withExif(exif).withMetadata({ orientation: 6 }).toBuffer();
      const { body, meta } = await download("rotated-orig.jpg", master);
      assert.equal(meta.orientation, 6, "orientation is kept");
      assert.ok(meta.exif && meta.exif.length < 64, "only a minimal EXIF block is left");
      assert.ok((await pixels(body)).equals(await pixels(master)), "progressive scans are copied intact");
      const { info } = await sharp(body).rotate().toBuffer({ resolveWithObject: true });
      assert.equal(info.width, 200, "it opens upright");
    }

    // A clean JPEG is sent byte for byte.
    {
      const master = await base().jpeg({ quality: 90 }).toBuffer();
      const { body } = await download("clean-orig.jpg", master, false);
      assert.ok(body.equals(master), "a master without metadata is unchanged");
    }

    // PNG: eXIf, iTXt (XMP) and tEXt chunks go; pixels and the profile stay.
    {
      const tagged = await base().png().withIccProfile("p3").withExif(exif).withXmp(xmp).toBuffer();
      const master = Buffer.concat([tagged.subarray(0, 33), pngText("Comment", SECRET), tagged.subarray(33)]);
      const { body, meta } = await download("png-orig.png", master);
      assert.equal(meta.xmp, undefined);
      assert.equal(meta.exif, undefined);
      assert.ok(meta.icc, "the colour profile stays");
      assert.ok((await pixels(body)).equals(await pixels(master)));
      const rotated = await base().png().withMetadata({ orientation: 3 }).toBuffer();
      const turned = await download("png-rotated-orig.png", rotated, false);
      assert.equal(turned.meta.orientation, 3, "PNG orientation is kept");
    }

    // WebP: EXIF and XMP chunks go and the VP8X flags agree.
    {
      const master = await base().webp({ lossless: true }).withIccProfile("p3").withExif(exif).withXmp(xmp).toBuffer();
      const { body, meta } = await download("webp-orig.webp", master);
      assert.equal(meta.xmp, undefined);
      assert.equal(meta.exif, undefined);
      assert.ok(meta.icc);
      assert.equal(body.readUInt32LE(4), body.length - 8, "the RIFF size matches");
      assert.equal(body[20] & 0x0c, 0, "the EXIF and XMP flags are cleared");
      assert.ok((await pixels(body)).equals(await pixels(master)));
      const rotated = await base().webp({ lossless: true }).withMetadata({ orientation: 8 }).toBuffer();
      const turned = await download("webp-rotated-orig.webp", rotated, false);
      assert.equal(turned.meta.orientation, 8, "WebP orientation is kept");
    }

    // TIFF is re-encoded on the fly, upright and lossless.
    {
      const master = await base().tiff({ compression: "lzw" }).withExif(exif).withXmp(xmp).toBuffer();
      const { body, meta } = await download("tiff-orig.tif", master);
      assert.equal(meta.format, "tiff");
      assert.equal(meta.xmp, undefined);
      assert.ok((await pixels(body)).equals(await pixels(master)));
    }

    // Nothing is written beside the masters.
    const left = (await fs.readdir(dir)).filter((name) => !name.endsWith("-orig.jpg") && !name.endsWith("-orig.png") && !name.endsWith("-orig.webp") && !name.endsWith("-orig.tif"));
    assert.deepEqual(left, [], "downloads leave no copies on disk");

    // Copies the old route left behind are swept once at boot.
    await fs.writeFile(path.join(dir, "abc123-dl.jpg"), "copy");
    await fs.writeFile(path.join(dir, "abc123-dl.jpg.42.tmp"), "partial");
    await fs.writeFile(path.join(dir, "abc123-orig.jpg"), "master");
    await sweepDownloadCopies();
    assert.deepEqual((await fs.readdir(dir)).filter((name) => name.startsWith("abc123")), ["abc123-orig.jpg"], "old download copies are removed, masters stay");
    await fs.writeFile(path.join(dir, "def456-dl.jpg"), "copy");
    await sweepDownloadCopies();
    assert.ok(await fs.stat(path.join(dir, "def456-dl.jpg")), "the sweep runs only once");

    console.log("✓ original downloads are stripped losslessly and leave nothing on disk");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
