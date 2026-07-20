"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";

export type StoragePreset = "original" | "archive" | "balanced";

export interface CreditProfile {
  creditName: string;
  socialLinks: { platform: string; url: string }[];
}

/** One credit set assigned to a photo in the wizard's credits step. */
export interface AssignedCredit {
  creditName: string;
  subject: string;
  socialLinks: { platform: string; url: string }[];
}

export interface PendingPhotoValue {
  id: string;
  name: string;
  previewUrl: string;
  state: "processing" | "pending" | "finalizing" | "ready" | "deleting";
  storagePreset: StoragePreset;
  candidatePreset: "archive" | "balanced" | null;
  width: number;
  height: number;
  sourceBytes: number | null;
  candidateBytes: number | null;
  renditionBytes: number | null;
  pendingBytes: number;
  finalBytes: number | null;
  compressionFailed: boolean;
}

export type QueueState =
  | "waiting"
  | "uploading"
  // The source is stored and a preview exists; the compressed master is being
  // produced by the server in the background. Browsable but not publish-ready.
  | "compressing"
  | "optimizing"
  | "ready"
  | "failed"
  | "discarding";
export type QueueError =
  | "quotaExceeded"
  | "unsupportedType"
  | "tooLarge"
  | "invalidImage"
  | "queueFull"
  | "unknown";

export interface QueuedFile {
  key: string;
  uploadId: string;
  name: string;
  file?: File;
  previewUrl?: string;
  fileBytes?: number;
  uploadedBytes?: number;
  photoId?: string;
  state: QueueState;
  error?: QueueError;
  storagePreset: StoragePreset;
  candidatePreset?: "archive" | "balanced" | null;
  width?: number;
  height?: number;
  sourceBytes?: number | null;
  candidateBytes?: number | null;
  renditionBytes?: number | null;
  pendingBytes?: number;
  finalBytes?: number | null;
  compressionFailed?: boolean;
  presetError?: "quotaExceeded" | "legacyPending" | "unknown";
}

let fileKeySeq = 0;

function newBatchId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `batch-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

function newUploadId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }
  const half = () => Math.random().toString(16).slice(2).padEnd(16, "0").slice(0, 16);
  return `${half()}${half()}`;
}

function normalizeUploadError(value: unknown): QueueError {
  if (
    value === "quotaExceeded" ||
    value === "unsupportedType" ||
    value === "tooLarge" ||
    value === "invalidImage" ||
    value === "queueFull"
  ) {
    return value;
  }
  return "unknown";
}

function serverPhotoPatch(
  photo: PendingPhotoValue
): Pick<
  QueuedFile,
  | "storagePreset"
  | "candidatePreset"
  | "width"
  | "height"
  | "sourceBytes"
  | "candidateBytes"
  | "renditionBytes"
  | "pendingBytes"
  | "finalBytes"
  | "compressionFailed"
> {
  return {
    storagePreset: photo.storagePreset,
    candidatePreset: photo.candidatePreset,
    width: photo.width,
    height: photo.height,
    sourceBytes: photo.sourceBytes,
    candidateBytes: photo.candidateBytes,
    renditionBytes: photo.renditionBytes,
    pendingBytes: photo.pendingBytes,
    finalBytes: photo.finalBytes,
    compressionFailed: photo.compressionFailed
  };
}

/**
 * Map a durable server upload state to the queue's client state. "processing"
 * spans background compression: it is browsable (a thumbnail exists) unless the
 * compression failed, in which case it surfaces as a retryable error.
 */
function serverQueueState(photo: {
  state: PendingPhotoValue["state"];
  compressionFailed: boolean;
}): { state: QueueState; error?: QueueError } {
  switch (photo.state) {
    case "pending":
      return { state: "ready" };
    case "deleting":
      return { state: "discarding" };
    case "processing":
      return photo.compressionFailed
        ? { state: "failed", error: "unknown" }
        : { state: "compressing" };
    case "finalizing":
      return { state: "compressing" };
    case "ready":
    default:
      return { state: "ready" };
  }
}

export interface PendingUploadQueue {
  files: QueuedFile[];
  /** Fully compressed, publish-ready photos. */
  readyFiles: (QueuedFile & { photoId: string })[];
  /** Photos that can be browsed/selected/credited now — ready plus those still
      compressing in the background. */
  browsableFiles: (QueuedFile & { photoId: string })[];
  queueWorking: boolean;
  /** A file is still transferring (waiting/uploading). Distinct from background
      compression, which does not block advancing through the wizard. */
  transferWorking: boolean;
  clearing: boolean;
  locked: boolean;
  setLocked: (locked: boolean) => void;
  discardError: boolean;
  oversizedSelectionCount: number;
  uploadTotalBytes: number;
  uploadPercent: number;
  uploadedCount: number;
  queueSelectedFiles: (
    event: ChangeEvent<HTMLInputElement>,
    storagePreset: StoragePreset
  ) => void;
  removeQueuedFile: (item: QueuedFile) => Promise<void>;
  retryQueuedFile: (item: QueuedFile) => Promise<void>;
  retryCompression: (item: QueuedFile) => Promise<void>;
  clearQueue: () => Promise<void>;
  changeStoragePreset: (item: QueuedFile, preset: StoragePreset) => Promise<void>;
  finalizeBatch: (
    batch: (QueuedFile & { photoId: string })[],
    credits: AssignedCredit[]
  ) => Promise<boolean>;
}

/**
 * The durable pending-upload queue behind the photo wizard. Transport
 * behavior (idempotent uploads, polling for ambiguous responses, durable
 * discard, quota-aware preset swaps) is carried over from the previous
 * single-screen PhotoUploader — the wizard changes presentation, not
 * transport.
 */
export function usePendingUploadQueue({
  eventId,
  initialPendingPhotos,
  uploadMaxBytes,
  confirmRemoveReady,
  confirmClear
}: {
  eventId: string;
  initialPendingPhotos: PendingPhotoValue[];
  uploadMaxBytes: number;
  confirmRemoveReady: (name: string) => boolean;
  confirmClear: (count: number, totalBytes: number) => boolean;
}): PendingUploadQueue {
  const router = useRouter();
  const batchIdRef = useRef<string | null>(null);
  const uploadChainRef = useRef<Promise<void>>(Promise.resolve());
  const cancelledKeysRef = useRef(new Set<string>());
  const activeUploadKeysRef = useRef(new Set<string>());
  const compressionTrackersRef = useRef(new Set<string>());
  const discardingKeysRef = useRef(new Set<string>());
  const uploadRequestsRef = useRef(new Map<string, XMLHttpRequest>());
  const lockedRef = useRef(false);
  const blobPreviewUrlsRef = useRef(new Set<string>());

  const [files, setFiles] = useState<QueuedFile[]>(() =>
    initialPendingPhotos.map((photo) => {
      const mapped = serverQueueState(photo);
      return {
        key: `server-${photo.id}`,
        uploadId: photo.id,
        name: photo.name,
        // The thumbnail exists as soon as the source is stored, so a processing
        // (compressing) row has a real preview; only finalizing has none.
        previewUrl: photo.state === "finalizing" ? undefined : photo.previewUrl,
        fileBytes: photo.sourceBytes ?? undefined,
        uploadedBytes: photo.sourceBytes ?? undefined,
        photoId: photo.id,
        ...serverPhotoPatch(photo),
        ...mapped
      };
    })
  );
  const [locked, setLockedState] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [discardError, setDiscardError] = useState(false);
  const [oversizedSelectionCount, setOversizedSelectionCount] = useState(0);

  function setLocked(next: boolean) {
    lockedRef.current = next;
    setLockedState(next);
  }

  const readyFiles = files.filter(
    (item): item is QueuedFile & { photoId: string } =>
      item.state === "ready" && typeof item.photoId === "string"
  );
  const browsableFiles = files.filter(
    (item): item is QueuedFile & { photoId: string } =>
      (item.state === "ready" ||
        item.state === "compressing" ||
        item.state === "optimizing") &&
      typeof item.photoId === "string"
  );
  const transferWorking = files.some(
    (item) => item.state === "waiting" || item.state === "uploading"
  );
  const queueWorking = files.some(
    (item) =>
      item.state === "waiting" ||
      item.state === "uploading" ||
      item.state === "compressing" ||
      item.state === "optimizing" ||
      item.state === "discarding"
  );
  const uploadTotalBytes = files.reduce(
    (total, item) => total + (item.fileBytes ?? item.sourceBytes ?? 0),
    0
  );
  const uploadedBytes = files.reduce((total, item) => {
    const itemTotal = item.fileBytes ?? item.sourceBytes ?? 0;
    if (item.state === "failed") return total;
    if (
      item.state === "ready" ||
      item.state === "compressing" ||
      item.state === "optimizing" ||
      item.state === "discarding"
    ) {
      // Transfer is complete once the row exists server-side; background
      // compression is tracked separately and does not hold up the bar.
      return total + itemTotal;
    }
    return total + Math.min(item.uploadedBytes ?? 0, itemTotal);
  }, 0);
  const uploadPercent =
    uploadTotalBytes > 0
      ? Math.min(100, Math.round((uploadedBytes / uploadTotalBytes) * 100))
      : files.length > 0 && files.every((item) => item.state === "ready")
        ? 100
        : 0;
  const uploadedCount = files.filter((item) => {
    if (item.state === "failed") return false;
    const itemTotal = item.fileBytes ?? item.sourceBytes ?? 0;
    return (
      item.state === "ready" ||
      item.state === "compressing" ||
      item.state === "optimizing" ||
      item.state === "discarding" ||
      (itemTotal > 0 && (item.uploadedBytes ?? 0) >= itemTotal)
    );
  }).length;

  function releaseBlobPreview(url: string | undefined) {
    if (!url || !blobPreviewUrlsRef.current.has(url)) return;
    URL.revokeObjectURL(url);
    blobPreviewUrlsRef.current.delete(url);
  }

  function serverPreviewUrl(photoId: string): string {
    return `/api/images/${eventId}/${photoId}-thumb.webp`;
  }

  function updateQueuedFile(key: string, patch: Partial<QueuedFile>) {
    setFiles((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item))
    );
  }

  /**
   * Poll a background-compressing photo out of band (not on the upload chain)
   * until it becomes pending (ready), fails, or is removed. This is what lets a
   * batch's uploads settle immediately while their compression finishes behind
   * the scenes.
   */
  async function trackCompression(key: string, uploadId: string) {
    if (compressionTrackersRef.current.has(key)) return;
    compressionTrackersRef.current.add(key);
    try {
      // Compression can queue behind other jobs and a large TIFF is slow, so
      // poll patiently rather than time out into a spurious error.
      for (let attempt = 0; attempt < 400; attempt++) {
        if (cancelledKeysRef.current.has(key)) return;
        await new Promise((resolve) => setTimeout(resolve, 1500));
        if (cancelledKeysRef.current.has(key)) return;
        let serverPhoto: PendingPhotoValue | undefined;
        try {
          const params = new URLSearchParams({ eventId, uploadId });
          const response = await fetch(`/api/admin/photos?${params}`, {
            cache: "no-store"
          });
          if (!response.ok) continue;
          const data = (await response.json()) as {
            photos?: PendingPhotoValue[];
          };
          serverPhoto = data.photos?.[0];
        } catch {
          continue;
        }
        if (cancelledKeysRef.current.has(key)) return;
        if (!serverPhoto) {
          // Discarded or finalized in another request/tab.
          setFiles((current) => current.filter((c) => c.key !== key));
          return;
        }
        if (serverPhoto.state === "pending") {
          updateQueuedFile(key, {
            state: "ready",
            previewUrl:
              serverPhoto.previewUrl || serverPreviewUrl(serverPhoto.id),
            error: undefined,
            ...serverPhotoPatch(serverPhoto)
          });
          return;
        }
        if (serverPhoto.state === "ready") {
          setFiles((current) => current.filter((c) => c.key !== key));
          router.refresh();
          return;
        }
        if (serverPhoto.state === "deleting") {
          updateQueuedFile(key, { state: "discarding" });
          continue;
        }
        if (serverPhoto.compressionFailed) {
          updateQueuedFile(key, {
            state: "failed",
            error: "unknown",
            compressionFailed: true
          });
          return;
        }
        // Still compressing/finalizing: keep the compressing state and wait.
      }
    } finally {
      compressionTrackersRef.current.delete(key);
    }
  }

  async function waitForServerUpload(item: QueuedFile): Promise<boolean> {
    // A duplicate POST receives 202 while the original request is still doing
    // Sharp work. Poll the durable row rather than sending the file again.
    let sawDeleting = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 750));
      try {
        const params = new URLSearchParams({
          eventId,
          uploadId: item.uploadId
        });
        const response = await fetch(`/api/admin/photos?${params}`, {
          cache: "no-store"
        });
        if (!response.ok) continue;
        const data = (await response.json()) as {
          photos?: PendingPhotoValue[];
        };
        const serverPhoto = data.photos?.[0];
        if (!serverPhoto) {
          if (sawDeleting) {
            setFiles((current) =>
              current.filter((candidate) => candidate.key !== item.key)
            );
            return true;
          }
          continue;
        }

        if (serverPhoto.state === "pending" && typeof serverPhoto.id === "string") {
          releaseBlobPreview(item.previewUrl);
          updateQueuedFile(item.key, {
            state: "ready",
            photoId: serverPhoto.id,
            file: undefined,
            previewUrl: serverPhoto.previewUrl || serverPreviewUrl(serverPhoto.id),
            fileBytes: serverPhoto.sourceBytes ?? item.fileBytes,
            uploadedBytes: serverPhoto.sourceBytes ?? item.fileBytes,
            error: undefined,
            ...serverPhotoPatch(serverPhoto)
          });
          return true;
        }
        if (serverPhoto.state === "ready") {
          setFiles((current) =>
            current.filter((candidate) => candidate.key !== item.key)
          );
          router.refresh();
          return true;
        }
        if (serverPhoto.state === "processing") {
          // Source committed; compression continues in the background. Hand off
          // to the out-of-band tracker instead of blocking this chain.
          releaseBlobPreview(item.previewUrl);
          updateQueuedFile(item.key, {
            state: serverPhoto.compressionFailed ? "failed" : "compressing",
            error: serverPhoto.compressionFailed ? "unknown" : undefined,
            photoId: serverPhoto.id,
            file: undefined,
            previewUrl:
              serverPhoto.previewUrl || serverPreviewUrl(serverPhoto.id),
            fileBytes: serverPhoto.sourceBytes ?? item.fileBytes,
            uploadedBytes: serverPhoto.sourceBytes ?? item.fileBytes,
            ...serverPhotoPatch(serverPhoto)
          });
          if (!serverPhoto.compressionFailed) {
            void trackCompression(item.key, item.uploadId);
          }
          return true;
        }
        if (serverPhoto.state === "deleting") {
          sawDeleting = true;
          updateQueuedFile(item.key, { state: "discarding" });
        }
      } catch {
        // Keep polling: this path exists specifically for an ambiguous network
        // response, and the durable row remains the source of truth.
      }
    }
    return false;
  }

  async function uploadQueuedFile(item: QueuedFile & { file: File }) {
    if (cancelledKeysRef.current.has(item.key)) return;

    updateQueuedFile(item.key, {
      state: "uploading",
      error: undefined,
      uploadedBytes: 0
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const body = new FormData();
        body.append("eventId", eventId);
        body.append(
          "batchId",
          batchIdRef.current ?? (batchIdRef.current = newBatchId())
        );
        body.append("uploadId", item.uploadId);
        body.append("storagePreset", item.storagePreset);
        body.append("file", item.file);
        const { status, data } = await new Promise<{
          status: number;
          data: (Partial<PendingPhotoValue> & { error?: unknown }) | null;
        }>((resolve, reject) => {
          const request = new XMLHttpRequest();
          uploadRequestsRef.current.set(item.key, request);
          request.open("POST", "/api/admin/photos");
          request.upload.addEventListener("progress", (progress) => {
            if (!progress.lengthComputable || progress.total <= 0) return;
            updateQueuedFile(item.key, {
              uploadedBytes: Math.min(
                item.file.size,
                Math.round((progress.loaded / progress.total) * item.file.size)
              )
            });
          });
          request.addEventListener("load", () => {
            uploadRequestsRef.current.delete(item.key);
            updateQueuedFile(item.key, { uploadedBytes: item.file.size });
            let parsed: (Partial<PendingPhotoValue> & { error?: unknown }) | null = null;
            try {
              parsed = request.responseText ? JSON.parse(request.responseText) : null;
            } catch {
              parsed = null;
            }
            resolve({ status: request.status, data: parsed });
          });
          request.addEventListener("error", () => {
            uploadRequestsRef.current.delete(item.key);
            reject(new Error("upload failed"));
          });
          request.addEventListener("abort", () => {
            uploadRequestsRef.current.delete(item.key);
            reject(new Error("upload aborted"));
          });
          request.send(body);
        });
        const responseOk = status >= 200 && status < 300;

        if (!responseOk) {
          updateQueuedFile(item.key, {
            state: "failed",
            error: normalizeUploadError(data?.error)
          });
          return;
        }
        if (data?.state === "processing" && typeof data.id === "string") {
          // Fast path: the source and thumbnail are stored; compression runs in
          // the background. Show the photo now and track completion out of band
          // so the upload chain drains without waiting on Sharp.
          releaseBlobPreview(item.previewUrl);
          updateQueuedFile(item.key, {
            state: data.compressionFailed ? "failed" : "compressing",
            error: data.compressionFailed ? "unknown" : undefined,
            photoId: data.id,
            file: undefined,
            previewUrl: data.previewUrl || serverPreviewUrl(data.id),
            fileBytes: data.sourceBytes ?? item.file.size,
            uploadedBytes: data.sourceBytes ?? item.file.size,
            ...serverPhotoPatch(data as PendingPhotoValue)
          });
          if (!data.compressionFailed) {
            void trackCompression(item.key, item.uploadId);
          }
          return;
        }
        if (status === 202 || data?.state === "deleting") {
          if (!(await waitForServerUpload(item))) {
            updateQueuedFile(item.key, { state: "failed", error: "unknown" });
          }
          return;
        }
        if (data?.state === "ready") {
          setFiles((current) =>
            current.filter((candidate) => candidate.key !== item.key)
          );
          router.refresh();
          return;
        }
        if (data?.state === "pending" && typeof data.id === "string") {
          releaseBlobPreview(item.previewUrl);
          updateQueuedFile(item.key, {
            state: "ready",
            photoId: data.id,
            file: undefined,
            previewUrl: data.previewUrl || serverPreviewUrl(data.id),
            fileBytes: data.sourceBytes ?? item.file.size,
            uploadedBytes: data.sourceBytes ?? item.file.size,
            error: undefined,
            ...(serverPhotoPatch(data as PendingPhotoValue))
          });
          return;
        }
      } catch {
        if (cancelledKeysRef.current.has(item.key)) return;
        if (attempt === 0) continue;
      }
    }

    // The second idempotent request also had an ambiguous response. Check the
    // durable row before offering Retry; it may have committed successfully.
    if (!(await waitForServerUpload(item))) {
      updateQueuedFile(item.key, { state: "failed", error: "unknown" });
    }
  }

  function enqueueUpload(item: QueuedFile & { file: File }) {
    if (activeUploadKeysRef.current.has(item.key)) return;
    activeUploadKeysRef.current.add(item.key);
    // Keep processing sequential across every picker opening. This preserves
    // the NAS-friendly memory behavior while still letting the user add more
    // files to the queue before the current selection has finished.
    uploadChainRef.current = uploadChainRef.current.then(async () => {
      try {
        await uploadQueuedFile(item);
      } finally {
        activeUploadKeysRef.current.delete(item.key);
      }
    });
  }

  function queueSelectedFiles(
    event: ChangeEvent<HTMLInputElement>,
    storagePreset: StoragePreset
  ) {
    const selected = Array.from(event.currentTarget.files ?? []);
    const accepted = selected.filter((file) => file.size <= uploadMaxBytes);
    setOversizedSelectionCount(selected.length - accepted.length);
    if (accepted.length > 0) {
      const queued = accepted.map((file) => {
        const uploadId = newUploadId();
        const previewUrl = URL.createObjectURL(file);
        blobPreviewUrlsRef.current.add(previewUrl);
        return {
          key: `local-${uploadId}-${fileKeySeq++}`,
          uploadId,
          name: file.name,
          file,
          previewUrl,
          fileBytes: file.size,
          uploadedBytes: 0,
          storagePreset,
          state: "waiting" as const
        };
      });
      setFiles((current) => [...current, ...queued]);
      setDiscardError(false);
      queued.forEach(enqueueUpload);
    }

    // A native file input replaces its FileList each time. The queue above is
    // our durable source of truth, and clearing the input also lets the same
    // file be selected again after it has been removed.
    event.currentTarget.value = "";
  }

  async function discardPendingPhoto(
    item: QueuedFile,
    updateStatus = true
  ): Promise<boolean> {
    if (discardingKeysRef.current.has(item.key)) return false;
    discardingKeysRef.current.add(item.key);
    updateQueuedFile(item.key, { state: "discarding" });
    try {
      const response = await fetch("/api/admin/photos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoId: item.photoId ?? item.uploadId })
      });
      if (!response.ok) {
        updateQueuedFile(item.key, {
          state: item.photoId ? "ready" : "failed"
        });
        if (updateStatus) setDiscardError(true);
        return false;
      }
      releaseBlobPreview(item.previewUrl);
      setFiles((current) => current.filter((candidate) => candidate.key !== item.key));
      if (updateStatus) setDiscardError(false);
      return true;
    } catch {
      updateQueuedFile(item.key, {
        state: item.photoId ? "ready" : "failed"
      });
      if (updateStatus) setDiscardError(true);
      return false;
    } finally {
      discardingKeysRef.current.delete(item.key);
    }
  }

  async function removeQueuedFile(item: QueuedFile) {
    if (item.state === "discarding" || lockedRef.current) return;
    if (item.state === "waiting") {
      cancelledKeysRef.current.add(item.key);
      releaseBlobPreview(item.previewUrl);
      setFiles((current) => current.filter((candidate) => candidate.key !== item.key));
      return;
    }
    if (item.state === "ready" && !confirmRemoveReady(item.name)) {
      return;
    }
    cancelledKeysRef.current.add(item.key);
    uploadRequestsRef.current.get(item.key)?.abort();
    await discardPendingPhoto(item);
  }

  async function retryQueuedFile(item: QueuedFile) {
    if (!item.file || item.state !== "failed" || lockedRef.current) return;
    if (discardingKeysRef.current.has(item.key)) return;
    discardingKeysRef.current.add(item.key);
    updateQueuedFile(item.key, { state: "discarding" });
    try {
      // An unknown failure may be a server restart that left a processing
      // reservation behind. Retire the old idempotency key first, then retry
      // with a fresh one; DELETE is harmless for quota/type failures where no
      // server row was ever created.
      const response = await fetch("/api/admin/photos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoId: item.photoId ?? item.uploadId })
      });
      if (!response.ok) {
        updateQueuedFile(item.key, { state: "failed", error: item.error });
        setDiscardError(true);
        return;
      }

      const uploadId = newUploadId();
      const retried: QueuedFile & { file: File } = {
        ...item,
        uploadId,
        photoId: undefined,
        state: "waiting",
        error: undefined,
        file: item.file,
        uploadedBytes: 0
      };
      cancelledKeysRef.current.delete(item.key);
      updateQueuedFile(item.key, retried);
      setDiscardError(false);
      enqueueUpload(retried);
    } catch {
      updateQueuedFile(item.key, { state: "failed", error: item.error });
      setDiscardError(true);
    } finally {
      discardingKeysRef.current.delete(item.key);
    }
  }

  async function clearQueue() {
    if (lockedRef.current || clearing || files.length === 0) return;
    const bytes = files.reduce(
      (sum, item) => sum + (item.pendingBytes ?? item.fileBytes ?? 0),
      0
    );
    if (!confirmClear(files.length, bytes)) return;
    setClearing(true);
    setDiscardError(false);
    const snapshot = files;
    let discardFailed = false;

    for (const item of snapshot) {
      cancelledKeysRef.current.add(item.key);
      uploadRequestsRef.current.get(item.key)?.abort();
      if (item.state === "waiting") {
        releaseBlobPreview(item.previewUrl);
        setFiles((current) =>
          current.filter((candidate) => candidate.key !== item.key)
        );
      } else if (item.state !== "discarding") {
        if (!(await discardPendingPhoto(item, false))) discardFailed = true;
      }
    }
    if (discardFailed) setDiscardError(true);
    setClearing(false);
  }

  async function changeStoragePreset(item: QueuedFile, preset: StoragePreset) {
    if (
      !item.photoId ||
      (item.state !== "ready" && item.state !== "compressing") ||
      lockedRef.current ||
      clearing
    ) {
      return;
    }
    const previousState = item.state;
    updateQueuedFile(item.key, { state: "optimizing", presetError: undefined });
    try {
      const response = await fetch("/api/admin/photos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoId: item.photoId, storagePreset: preset })
      });
      const data = (await response.json().catch(() => null)) as
        | (PendingPhotoValue & { error?: unknown })
        | { error?: unknown }
        | null;
      if (!response.ok || !data || !("id" in data)) {
        const error = data && "error" in data ? data.error : undefined;
        updateQueuedFile(item.key, {
          state: previousState,
          presetError:
            error === "quotaExceeded"
              ? "quotaExceeded"
              : error === "legacyPending"
                ? "legacyPending"
                : "unknown"
        });
        return;
      }
      // A real re-encode is backgrounded (server returns processing); a no-op
      // preset flip returns pending. Reflect either and track the former.
      if (data.state === "processing") {
        updateQueuedFile(item.key, {
          state: "compressing",
          presetError: undefined,
          ...serverPhotoPatch(data)
        });
        void trackCompression(item.key, item.photoId);
        return;
      }
      updateQueuedFile(item.key, {
        state: "ready",
        presetError: undefined,
        ...serverPhotoPatch(data)
      });
    } catch {
      updateQueuedFile(item.key, { state: previousState, presetError: "unknown" });
    }
  }

  async function retryCompression(item: QueuedFile) {
    if (!item.photoId || lockedRef.current || clearing) return;
    updateQueuedFile(item.key, {
      state: "compressing",
      error: undefined,
      compressionFailed: false,
      presetError: undefined
    });
    try {
      const response = await fetch("/api/admin/photos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photoId: item.photoId,
          storagePreset: item.storagePreset
        })
      });
      const data = (await response.json().catch(() => null)) as
        | (PendingPhotoValue & { error?: unknown })
        | { error?: unknown }
        | null;
      if (!response.ok || !data || !("id" in data)) {
        updateQueuedFile(item.key, {
          state: "failed",
          error: "unknown",
          compressionFailed: true
        });
        return;
      }
      updateQueuedFile(item.key, { ...serverPhotoPatch(data) });
      void trackCompression(item.key, item.photoId);
    } catch {
      updateQueuedFile(item.key, {
        state: "failed",
        error: "unknown",
        compressionFailed: true
      });
    }
  }

  async function finalizeBatch(
    batch: (QueuedFile & { photoId: string })[],
    credits: AssignedCredit[]
  ): Promise<boolean> {
    if (batch.length === 0) return true;
    const requestBody = JSON.stringify({
      eventId,
      photoIds: batch.map((item) => item.photoId),
      credits: JSON.stringify(credits)
    });
    let response: Response | null = null;
    for (let attempt = 0; attempt < 2 && !response; attempt++) {
      try {
        response = await fetch("/api/admin/photos", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: requestBody
        });
      } catch {
        // PATCH is idempotent for an already-finalized exact id set, so one
        // retry resolves the common "commit succeeded, response was lost"
        // case without applying credits twice.
      }
    }
    if (!response || !response.ok) return false;

    const finalizedKeys = new Set(batch.map((item) => item.key));
    batch.forEach((item) => releaseBlobPreview(item.previewUrl));
    setFiles((current) => current.filter((item) => !finalizedKeys.has(item.key)));
    return true;
  }

  useEffect(() => {
    const serverById = new Map(
      initialPendingPhotos.map((photo) => [photo.id, photo] as const)
    );
    setFiles((current) => {
      const seen = new Set<string>();
      const reconciled = current.flatMap((item) => {
        const server = serverById.get(item.uploadId);
        if (!server) {
          // A server-backed item that disappeared was finalized or discarded
          // in another request/tab. Local-only waiting/failed work stays.
          return item.photoId ? [] : [item];
        }
        seen.add(server.id);
        // Don't clobber a locally-tracked optimizing/compressing transition
        // (a just-issued preset change) with a stale server snapshot.
        if (item.state === "optimizing") return [item];
        return [
          {
            ...item,
            name: server.name,
            photoId: server.id,
            previewUrl:
              server.state === "finalizing" ? item.previewUrl : server.previewUrl,
            fileBytes: server.sourceBytes ?? item.fileBytes,
            uploadedBytes: server.sourceBytes ?? item.uploadedBytes,
            ...serverPhotoPatch(server),
            file: server.state === "pending" ? undefined : item.file,
            ...serverQueueState(server)
          }
        ];
      });

      for (const server of initialPendingPhotos) {
        if (seen.has(server.id)) continue;
        reconciled.push({
          key: `server-${server.id}`,
          uploadId: server.id,
          name: server.name,
          photoId: server.id,
          previewUrl:
            server.state === "finalizing" ? undefined : server.previewUrl,
          fileBytes: server.sourceBytes ?? undefined,
          uploadedBytes: server.sourceBytes ?? undefined,
          ...serverPhotoPatch(server),
          ...serverQueueState(server)
        });
      }
      return reconciled;
    });
  }, [initialPendingPhotos]);

  useEffect(() => {
    const previews = blobPreviewUrlsRef.current;
    return () => {
      for (const url of previews) URL.revokeObjectURL(url);
      previews.clear();
    };
  }, []);

  useEffect(() => {
    for (const photo of initialPendingPhotos) {
      const key = `server-${photo.id}`;
      // A row still processing (server-side) is compressing in the background:
      // track it to completion. A failed compression is left for the user to
      // retry from the queue.
      if (photo.state === "processing" && !photo.compressionFailed) {
        void trackCompression(key, photo.id);
      }
      if (photo.state === "finalizing") {
        void trackCompression(key, photo.id);
      }
      if (photo.state === "deleting") {
        void discardPendingPhoto({
          key,
          uploadId: photo.id,
          name: photo.name,
          photoId: photo.id,
          storagePreset: photo.storagePreset,
          state: "discarding"
        });
      }
    }
    // The server id set is the trigger; queue helpers deliberately use their
    // latest closures and idempotent endpoints.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPendingPhotos]);

  return {
    files,
    readyFiles,
    browsableFiles,
    queueWorking,
    transferWorking,
    clearing,
    locked,
    setLocked,
    discardError,
    oversizedSelectionCount,
    uploadTotalBytes,
    uploadPercent,
    uploadedCount,
    queueSelectedFiles,
    removeQueuedFile,
    retryQueuedFile,
    retryCompression,
    clearQueue,
    changeStoragePreset,
    finalizeBatch
  };
}
