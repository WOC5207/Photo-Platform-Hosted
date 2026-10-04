import type { Photo } from "@prisma/client";
import { photoUrls } from "@/lib/images";
import type { PendingPhotoValue } from "@/components/admin/wizard/usePendingUploadQueue";

/** A photo still in an upload batch, as the photo wizard resumes it. */
export function pendingPhotoValue(photo: Photo): PendingPhotoValue {
  return {
    id: photo.id,
    name: photo.originalName,
    previewUrl: photoUrls(photo.eventId, photo.id).thumb,
    state:
      photo.uploadState === "awaiting"
        ? "awaiting"
        : photo.uploadState === "processing" ||
            photo.uploadState === "finalizing"
          ? "processing"
          : photo.uploadState === "deleting"
            ? "deleting"
            : "pending",
    storagePreset:
      photo.storagePreset === "archive" || photo.storagePreset === "balanced"
        ? photo.storagePreset
        : "original",
    candidatePreset:
      photo.candidatePreset === "archive" || photo.candidatePreset === "balanced"
        ? photo.candidatePreset
        : null,
    width: photo.width,
    height: photo.height,
    sourceBytes: photo.sourceBytes,
    candidateBytes: photo.candidateBytes,
    renditionBytes: photo.renditionBytes,
    pendingBytes: photo.bytes,
    finalBytes:
      photo.renditionBytes != null &&
      (photo.storagePreset === "original"
        ? photo.sourceBytes != null
        : photo.candidateBytes != null)
        ? (photo.storagePreset === "original"
            ? photo.sourceBytes!
            : photo.candidateBytes!) + photo.renditionBytes
        : null,
    compressionFailed: photo.compressionFailed
  };
}
