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
  | "tooManyFiles";

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

export async function parseSingleImageMultipart(
  request: Request
): Promise<ParsedMultipartUpload> {
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
