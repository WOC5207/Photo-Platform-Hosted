import "server-only";
import { createWriteStream, promises as fs } from "fs";
import path from "path";
import { Readable, Transform } from "stream";
import { pipeline } from "stream/promises";
import Busboy from "busboy";
import { config } from "./config";

const REQUEST_OVERHEAD_BYTES = 64 * 1024;

export type MultipartUploadErrorCode =
  | "badRequest"
  | "tooLarge"
  | "tooManyFiles"
  | "busy";

export class MultipartUploadError extends Error {
  constructor(public readonly code: MultipartUploadErrorCode) {
    super(code);
  }
}

export interface ParsedMultipartUpload {
  fields: Map<string, string>;
  file: { path: string; name: string; type: string; size: number };
  cleanup(): Promise<void>;
}

// Each upload streams up to UPLOAD_MAX_MB to disk before any per-account cap
// can be checked, so one account may only have a few in flight at once. The
// photo wizard sends files one at a time; this only stops parallel floods.
const MAX_IN_FLIGHT_PER_UPLOADER = 3;
const inFlightByUploader = new Map<string, number>();

/** Maps a parse failure to the JSON error and status every upload route uses. */
export function multipartErrorResponse(error: unknown): {
  body: { error: "tooLarge" | "busy" | "badRequest" };
  status: number;
} {
  const code = error instanceof MultipartUploadError ? error.code : null;
  if (code === "tooLarge") return { body: { error: "tooLarge" }, status: 413 };
  if (code === "busy") return { body: { error: "busy" }, status: 429 };
  return { body: { error: "badRequest" }, status: 400 };
}

/**
 * Removes temporary upload directories a previous process left behind (an
 * OOM kill skips the per-request cleanup). Called once at boot.
 */
export async function sweepUploadTemp(maxAgeMs = 10 * 60 * 1000): Promise<void> {
  const tempRoot = path.resolve(config.photosDir(), ".upload-tmp");
  const entries = await fs.readdir(tempRoot, { withFileTypes: true }).catch(() => []);
  const cutoff = Date.now() - maxAgeMs;
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("incoming-")) continue;
    const dir = path.join(tempRoot, entry.name);
    const stat = await fs.stat(dir).catch(() => null);
    if (stat && stat.mtimeMs < cutoff) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

export async function parseSingleImageMultipart(
  request: Request,
  uploaderId: string
): Promise<ParsedMultipartUpload> {
  const inFlight = inFlightByUploader.get(uploaderId) ?? 0;
  if (inFlight >= MAX_IN_FLIGHT_PER_UPLOADER) {
    throw new MultipartUploadError("busy");
  }
  inFlightByUploader.set(uploaderId, inFlight + 1);
  try {
    return await parseUpload(request);
  } finally {
    const remaining = (inFlightByUploader.get(uploaderId) ?? 1) - 1;
    if (remaining > 0) inFlightByUploader.set(uploaderId, remaining);
    else inFlightByUploader.delete(uploaderId);
  }
}

async function parseUpload(request: Request): Promise<ParsedMultipartUpload> {
  const maxFileBytes = config.uploadMaxBytes();
  const declaredLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > maxFileBytes + REQUEST_OVERHEAD_BYTES
  ) {
    throw new MultipartUploadError("tooLarge");
  }
  if (!request.body) throw new MultipartUploadError("badRequest");

  const tempRoot = path.resolve(config.photosDir(), ".upload-tmp");
  await fs.mkdir(tempRoot, { recursive: true });
  const tempDir = await fs.mkdtemp(path.join(tempRoot, "incoming-"));
  const tempPath = path.join(tempDir, "upload.bin");
  const cleanup = () => fs.rm(tempDir, { recursive: true, force: true });

  try {
    const fields = new Map<string, string>();
    let fileInfo: ParsedMultipartUpload["file"] | null = null;
    let fileWrite: Promise<void> | null = null;
    let terminalError: MultipartUploadError | null = null;
    const source = Readable.fromWeb(request.body as never);
    let requestBytes = 0;
    const requestLimiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        requestBytes += chunk.length;
        if (requestBytes > maxFileBytes + REQUEST_OVERHEAD_BYTES) {
          terminalError = new MultipartUploadError("tooLarge");
          callback(terminalError);
          return;
        }
        callback(null, chunk);
      }
    });
    const parser = Busboy({
      headers: Object.fromEntries(request.headers.entries()),
      limits: {
        fieldNameSize: 100,
        fieldSize: 2_000,
        fields: 12,
        files: 1,
        parts: 13,
        fileSize: maxFileBytes
      }
    });

    parser.on("field", (name, value) => {
      if (!terminalError) fields.set(name, value);
    });
    parser.on("file", (_name, stream, info) => {
      if (fileInfo) {
        terminalError = new MultipartUploadError("tooManyFiles");
        source.destroy(terminalError);
        stream.resume();
        return;
      }
      fileInfo = { path: tempPath, name: info.filename, type: info.mimeType, size: 0 };
      stream.on("data", (chunk: Buffer) => {
        if (fileInfo) fileInfo.size += chunk.length;
      });
      stream.once("limit", () => {
        terminalError = new MultipartUploadError("tooLarge");
        source.destroy(terminalError);
      });
      // Attach a rejection handler immediately. When a limit destroys the
      // request stream, the outer pipeline and this file pipeline can reject
      // independently; leaving this promise temporarily unobserved can become
      // an unhandled rejection before the outer catch reaches it.
      fileWrite = pipeline(stream, createWriteStream(tempPath, { flags: "wx" })).catch(
        (error) => {
          if (!terminalError) throw error;
        }
      );
    });
    parser.once("filesLimit", () => {
      terminalError = new MultipartUploadError("tooManyFiles");
      source.destroy(terminalError);
    });
    parser.once("fieldsLimit", () => {
      terminalError = new MultipartUploadError("badRequest");
      source.destroy(terminalError);
    });
    parser.once("partsLimit", () => {
      terminalError = new MultipartUploadError("badRequest");
      source.destroy(terminalError);
    });

    try {
      await pipeline(source, requestLimiter, parser);
    } finally {
      if (fileWrite) await fileWrite;
    }
    if (terminalError) throw terminalError;
    const completedFile = fileInfo as ParsedMultipartUpload["file"] | null;
    if (!completedFile || completedFile.size <= 0) {
      throw new MultipartUploadError("badRequest");
    }

    return { fields, file: completedFile, cleanup };
  } catch (error) {
    await cleanup();
    if (error instanceof MultipartUploadError) throw error;
    throw new MultipartUploadError("badRequest");
  }
}
