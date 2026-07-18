"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import SocialLinksEditor, {
  emptySocialLink,
  type SocialLinkValue
} from "./SocialLinksEditor";

export interface CreditProfile {
  creditName: string;
  socialLinks: { platform: string; url: string }[];
}

export interface PendingPhotoValue {
  id: string;
  name: string;
  state: "processing" | "pending" | "finalizing" | "ready" | "deleting";
  storagePreset: StoragePreset;
  candidatePreset: "archive" | "balanced" | null;
  sourceBytes: number | null;
  candidateBytes: number | null;
  renditionBytes: number | null;
  pendingBytes: number;
  finalBytes: number | null;
}

type Mode = "single" | "multiple";
type StoragePreset = "original" | "archive" | "balanced";
type QueueState =
  | "waiting"
  | "uploading"
  | "optimizing"
  | "ready"
  | "failed"
  | "discarding";
type QueueError =
  | "quotaExceeded"
  | "unsupportedType"
  | "tooLarge"
  | "invalidImage"
  | "queueFull"
  | "unknown";

interface QueuedFile {
  key: string;
  uploadId: string;
  name: string;
  file?: File;
  photoId?: string;
  state: QueueState;
  error?: QueueError;
  storagePreset: StoragePreset;
  candidatePreset?: "archive" | "balanced" | null;
  sourceBytes?: number | null;
  candidateBytes?: number | null;
  renditionBytes?: number | null;
  pendingBytes?: number;
  finalBytes?: number | null;
  presetError?: "quotaExceeded" | "legacyPending" | "unknown";
}

type FinalizeStatus =
  | { kind: "success"; count: number }
  | { kind: "error"; message: "finalize" | "discard" };

interface Row {
  key: number;
  creditName: string;
  subject: string;
  socialLinks: SocialLinkValue[];
  // The name this row's social links currently reflect (from a profile
  // match, or "" if cleared/no match) — lets us tell when the name has moved
  // on to a different person and the links need to follow, instead of
  // lingering from whoever was typed before.
  linksSourceName: string;
}

let rowKeySeq = 0;
let fileKeySeq = 0;

function emptyRow(): Row {
  return {
    key: rowKeySeq++,
    creditName: "",
    subject: "",
    socialLinks: [],
    linksSourceName: ""
  };
}

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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && value >= 1024; index++) {
    value /= 1024;
    unit = units[index];
  }
  return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${unit}`;
}

function serverPhotoPatch(
  photo: PendingPhotoValue
): Pick<
  QueuedFile,
  | "storagePreset"
  | "candidatePreset"
  | "sourceBytes"
  | "candidateBytes"
  | "renditionBytes"
  | "pendingBytes"
  | "finalBytes"
> {
  return {
    storagePreset: photo.storagePreset,
    candidatePreset: photo.candidatePreset,
    sourceBytes: photo.sourceBytes,
    candidateBytes: photo.candidateBytes,
    renditionBytes: photo.renditionBytes,
    pendingBytes: photo.pendingBytes,
    finalBytes: photo.finalBytes
  };
}

const inputCls =
  "min-h-10 min-w-0 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg outline-none focus-visible:border-fg-subtle focus-visible:ring-2 focus-visible:ring-fg/20";
const modeBtnCls = (active: boolean) =>
  `inline-flex min-h-10 items-center justify-center rounded-lg px-3 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40 max-sm:min-h-11 ${
    active
      ? "bg-fg text-page"
      : "border border-border-strong text-fg-muted hover:border-fg-faint hover:text-fg"
  }`;
const btnCls =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-border-strong px-3 py-2 text-xs font-semibold text-fg-muted transition hover:border-fg-faint hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40 disabled:opacity-40 max-sm:min-h-11";

export default function PhotoUploader({
  eventId,
  initialPendingPhotos,
  allowOriginal,
  creditProfiles,
  creditTerm,
  subjectTerm
}: {
  eventId: string;
  initialPendingPhotos: PendingPhotoValue[];
  allowOriginal: boolean;
  creditProfiles: CreditProfile[];
  creditTerm: string;
  subjectTerm: string;
}) {
  const t = useTranslations("adminEvents");
  const tc = useTranslations("common");
  const router = useRouter();
  const batchIdRef = useRef<string | null>(null);
  const uploadChainRef = useRef<Promise<void>>(Promise.resolve());
  const cancelledKeysRef = useRef(new Set<string>());
  const activeUploadKeysRef = useRef(new Set<string>());
  const discardingKeysRef = useRef(new Set<string>());
  const finalizingRef = useRef(false);

  const [files, setFiles] = useState<QueuedFile[]>(() =>
    initialPendingPhotos.map((photo) => ({
      key: `server-${photo.id}`,
      uploadId: photo.id,
      name: photo.name,
      photoId: photo.id,
      ...serverPhotoPatch(photo),
      state:
        photo.state === "processing" || photo.state === "finalizing"
          ? "uploading"
          : photo.state === "deleting"
            ? "discarding"
            : "ready"
    }))
  );
  const [mode, setMode] = useState<Mode>("single");
  const [batchPreset, setBatchPreset] = useState<StoragePreset>("balanced");
  const [rows, setRows] = useState<Row[]>(() => [emptyRow()]);
  const [finalizeStatus, setFinalizeStatus] = useState<FinalizeStatus | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [clearing, setClearing] = useState(false);

  const credits = rows
    .map((row) => ({
      creditName: row.creditName.trim(),
      subject: row.subject.trim(),
      socialLinks: row.socialLinks
        .map((link) => ({ platform: link.platform, url: link.url.trim() }))
        .filter((link) => link.url.length > 0)
    }))
    .filter((row) => row.creditName.length > 0);

  const readyFiles = files.filter(
    (item): item is QueuedFile & { photoId: string } =>
      item.state === "ready" && typeof item.photoId === "string"
  );
  const queueWorking = files.some(
    (item) =>
      item.state === "waiting" ||
      item.state === "uploading" ||
      item.state === "optimizing" ||
      item.state === "discarding"
  );
  const canCreate =
    !finalizing && !clearing && !queueWorking && readyFiles.length > 0 && credits.length > 0;

  function updateQueuedFile(key: string, patch: Partial<QueuedFile>) {
    setFiles((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item))
    );
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
          updateQueuedFile(item.key, {
            state: "ready",
            photoId: serverPhoto.id,
            file: undefined,
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

    updateQueuedFile(item.key, { state: "uploading", error: undefined });
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
        const response = await fetch("/api/admin/photos", { method: "POST", body });
        const data = (await response.json().catch(() => null)) as
          | (Partial<PendingPhotoValue> & { error?: unknown })
          | null;

        if (!response.ok) {
          updateQueuedFile(item.key, {
            state: "failed",
            error: normalizeUploadError(data?.error)
          });
          return;
        }
        if (
          response.status === 202 ||
          data?.state === "processing" ||
          data?.state === "deleting"
        ) {
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
          updateQueuedFile(item.key, {
            state: "ready",
            photoId: data.id,
            file: undefined,
            error: undefined,
            ...(serverPhotoPatch(data as PendingPhotoValue))
          });
          return;
        }
      } catch {
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

  function queueSelectedFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.currentTarget.files ?? []);
    if (selected.length > 0) {
      const queued = selected.map((file) => {
        const uploadId = newUploadId();
        return {
          key: `local-${uploadId}-${fileKeySeq++}`,
          uploadId,
          name: file.name,
          file,
          storagePreset: batchPreset,
          state: "waiting" as const
        };
      });
      setFiles((current) => [...current, ...queued]);
      setFinalizeStatus(null);
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
          state: item.state === "failed" ? "failed" : "ready"
        });
        if (updateStatus) {
          setFinalizeStatus({ kind: "error", message: "discard" });
        }
        return false;
      }
      setFiles((current) => current.filter((candidate) => candidate.key !== item.key));
      if (updateStatus) setFinalizeStatus(null);
      return true;
    } catch {
      updateQueuedFile(item.key, {
        state: item.state === "failed" ? "failed" : "ready"
      });
      if (updateStatus) {
        setFinalizeStatus({ kind: "error", message: "discard" });
      }
      return false;
    } finally {
      discardingKeysRef.current.delete(item.key);
    }
  }

  async function removeQueuedFile(item: QueuedFile) {
    if (
      item.state === "uploading" ||
      item.state === "optimizing" ||
      item.state === "discarding" ||
      finalizing
    )
      return;
    if (item.state === "waiting") {
      cancelledKeysRef.current.add(item.key);
      setFiles((current) => current.filter((candidate) => candidate.key !== item.key));
      setFinalizeStatus(null);
      return;
    }
    await discardPendingPhoto(item);
  }

  async function retryQueuedFile(item: QueuedFile) {
    if (!item.file || item.state !== "failed" || finalizing) return;
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
        setFinalizeStatus({ kind: "error", message: "discard" });
        return;
      }

      const uploadId = newUploadId();
      const retried: QueuedFile & { file: File } = {
        ...item,
        uploadId,
        photoId: undefined,
        state: "waiting",
        error: undefined,
        file: item.file
      };
      cancelledKeysRef.current.delete(item.key);
      updateQueuedFile(item.key, retried);
      setFinalizeStatus(null);
      enqueueUpload(retried);
    } catch {
      updateQueuedFile(item.key, { state: "failed", error: item.error });
      setFinalizeStatus({ kind: "error", message: "discard" });
    } finally {
      discardingKeysRef.current.delete(item.key);
    }
  }

  async function clearQueue() {
    if (queueWorking || finalizing || clearing) return;
    setClearing(true);
    setFinalizeStatus(null);
    const snapshot = files;
    let discardFailed = false;

    for (const item of snapshot) {
      if (item.state === "waiting") {
        cancelledKeysRef.current.add(item.key);
        setFiles((current) =>
          current.filter((candidate) => candidate.key !== item.key)
        );
      } else if (item.state === "ready" || item.state === "failed") {
        if (!(await discardPendingPhoto(item, false))) discardFailed = true;
      }
    }
    if (discardFailed) {
      setFinalizeStatus({ kind: "error", message: "discard" });
    }
    setClearing(false);
  }

  async function changeStoragePreset(item: QueuedFile, preset: StoragePreset) {
    if (!item.photoId || item.state !== "ready" || finalizing || clearing) return;
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
          state: "ready",
          presetError:
            error === "quotaExceeded"
              ? "quotaExceeded"
              : error === "legacyPending"
                ? "legacyPending"
                : "unknown"
        });
        return;
      }
      updateQueuedFile(item.key, {
        state: "ready",
        presetError: undefined,
        ...serverPhotoPatch(data)
      });
    } catch {
      updateQueuedFile(item.key, { state: "ready", presetError: "unknown" });
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setRows((current) => {
      if (next === "single") return current.length > 0 ? [current[0]] : [emptyRow()];
      if (current.length < 2) {
        return [
          ...current,
          ...Array.from({ length: 2 - current.length }, emptyRow)
        ];
      }
      return current;
    });
  }

  function updateRow(key: number, patch: Partial<Row>) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row))
    );
  }

  // Keep social links synchronized with the remembered profile for the name
  // currently typed in a credit row.
  function syncLinksToName(key: number, typedName: string) {
    const name = typedName.trim();
    setRows((current) =>
      current.map((row) => {
        if (row.key !== key || name === row.linksSourceName) return row;
        const profile = creditProfiles.find((candidate) => candidate.creditName === name);
        return {
          ...row,
          linksSourceName: name,
          socialLinks: profile
            ? profile.socialLinks.map((link) => emptySocialLink(link))
            : []
        };
      })
    );
  }

  async function handleCreate() {
    if (!canCreate || finalizingRef.current) return;
    finalizingRef.current = true;
    const batch = readyFiles;
    setFinalizing(true);
    setFinalizeStatus(null);
    try {
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
      if (!response) {
        setFinalizeStatus({ kind: "error", message: "finalize" });
        router.refresh();
        return;
      }
      if (!response.ok) {
        setFinalizeStatus({ kind: "error", message: "finalize" });
        router.refresh();
        return;
      }

      const finalizedKeys = new Set(batch.map((item) => item.key));
      setFiles((current) =>
        current.filter((item) => !finalizedKeys.has(item.key))
      );
      setFinalizeStatus({ kind: "success", count: batch.length });
      if (files.length === batch.length) {
        setRows(mode === "single" ? [emptyRow()] : [emptyRow(), emptyRow()]);
      }
      router.refresh();
    } catch {
      setFinalizeStatus({ kind: "error", message: "finalize" });
    } finally {
      finalizingRef.current = false;
      setFinalizing(false);
    }
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
        return [
          {
            ...item,
            name: server.name,
            photoId: server.id,
            ...serverPhotoPatch(server),
            file: server.state === "pending" ? undefined : item.file,
            state:
              server.state === "processing" || server.state === "finalizing"
                ? ("uploading" as const)
                : server.state === "deleting"
                  ? ("discarding" as const)
                  : ("ready" as const)
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
          ...serverPhotoPatch(server),
          state:
            server.state === "processing" || server.state === "finalizing"
              ? "uploading"
              : server.state === "deleting"
                ? "discarding"
                : "ready"
        });
      }
      return reconciled;
    });
  }, [initialPendingPhotos]);

  useEffect(() => {
    for (const photo of initialPendingPhotos) {
      const item: QueuedFile = {
        key: `server-${photo.id}`,
        uploadId: photo.id,
        name: photo.name,
        photoId: photo.id,
        ...serverPhotoPatch(photo),
        state:
          photo.state === "processing" || photo.state === "finalizing"
            ? "uploading"
            : photo.state === "deleting"
              ? "discarding"
              : "ready"
      };
      if (photo.state === "processing" || photo.state === "finalizing") {
        void waitForServerUpload(item).then((settled) => {
          if (!settled) {
            updateQueuedFile(item.key, { state: "failed", error: "unknown" });
          }
        });
      }
      if (photo.state === "deleting") void discardPendingPhoto(item);
    }
    // The server id set is the trigger; queue helpers deliberately use their
    // latest closures and idempotent endpoints.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPendingPhotos]);

  function queueStateLabel(item: QueuedFile): string {
    if (item.state === "waiting") return t("pendingWaiting");
    if (item.state === "uploading") return t("pendingUploading");
    if (item.state === "optimizing") return t("pendingOptimizing");
    if (item.state === "ready") return t("pendingReady");
    if (item.state === "discarding") return t("pendingRemoving");
    if (item.error === "quotaExceeded") return t("pendingErrorQuota");
    if (item.error === "queueFull") return t("pendingErrorQueueFull");
    if (item.error === "unsupportedType") return t("pendingErrorUnsupported");
    if (item.error === "tooLarge") return t("pendingErrorTooLarge");
    if (item.error === "invalidImage") return t("pendingErrorInvalid");
    return t("pendingErrorUnknown");
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border-strong p-4">
      <datalist id="known-credits">
        {creditProfiles.map((profile) => (
          <option key={profile.creditName} value={profile.creditName} />
        ))}
      </datalist>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-w-52 flex-col gap-1 text-xs font-medium text-fg-muted">
          {t("storagePresetLabel")}
          <select
            value={batchPreset}
            disabled={finalizing || clearing}
            onChange={(event) =>
              setBatchPreset(event.target.value as StoragePreset)
            }
            className={inputCls}
          >
            {allowOriginal && (
              <option value="original">{t("storagePresetOriginal")}</option>
            )}
            <option value="archive">{t("storagePresetArchive")}</option>
            <option value="balanced">{t("storagePresetBalanced")}</option>
          </select>
        </label>
        <label className="flex min-h-11 w-fit cursor-pointer items-center gap-2 rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-fg-muted transition hover:border-fg-subtle hover:text-fg focus-within:ring-2 focus-within:ring-fg/40">
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            disabled={finalizing || clearing}
            onChange={queueSelectedFiles}
            className="sr-only"
          />
          <span>+ {t("upload")}</span>
        </label>
        <span role="status" aria-live="polite" className="text-sm text-fg-subtle">
          {files.length > 0
            ? t("filesSelected", { count: files.length })
            : t("noFilesSelected")}
        </span>
      </div>
      <p className="-mt-1 text-xs text-fg-subtle">{t("uploadHint")}</p>
      {!allowOriginal && (
        <p className="-mt-1 text-xs text-fg-subtle">
          {t("storageOriginalDisabled")}
        </p>
      )}

      {files.length > 0 && (
        <section
          aria-labelledby="pending-upload-heading"
          className="rounded-lg border border-border-strong/60 bg-surface/50 p-3"
        >
          <div className="flex items-center justify-between gap-3">
            <h3 id="pending-upload-heading" className="text-sm font-semibold text-fg">
              {t("pendingQueue")}
            </h3>
            <button
              type="button"
              disabled={queueWorking || finalizing || clearing}
              onClick={clearQueue}
              className={`${btnCls} min-h-8 px-2 py-1 max-sm:min-h-11`}
            >
              {clearing ? "…" : t("clearPendingQueue")}
            </button>
          </div>
          <p className="mt-2 text-xs text-fg-subtle">
            {t("pendingStorageNotice")}
          </p>
          <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto pr-1">
            {files.map((item) => (
              <li
                key={item.key}
                className="flex min-h-10 flex-col gap-2 rounded-lg px-3 py-2 text-sm text-fg-muted odd:bg-page/60"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate font-medium" title={item.name}>
                    {item.name}
                  </span>
                  <span
                    role="status"
                    className={
                      item.state === "failed"
                        ? "text-xs text-danger"
                        : "text-xs text-fg-subtle"
                    }
                  >
                    {queueStateLabel(item)}
                  </span>
                </div>

                {item.photoId && item.sourceBytes != null && item.candidateBytes != null && (
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,12rem)_1fr] sm:items-end">
                    <label className="flex flex-col gap-1 text-xs text-fg-subtle">
                      {t("storagePresetPhotoLabel")}
                      <select
                        aria-label={t("storagePresetPhotoLabel")}
                        value={item.storagePreset}
                        disabled={item.state !== "ready" || finalizing || clearing}
                        onChange={(event) =>
                          void changeStoragePreset(
                            item,
                            event.target.value as StoragePreset
                          )
                        }
                        className={`${inputCls} min-h-11`}
                      >
                        {(allowOriginal || item.storagePreset === "original") && (
                          <option value="original">{t("storagePresetOriginal")}</option>
                        )}
                        <option value="archive">{t("storagePresetArchive")}</option>
                        <option value="balanced">{t("storagePresetBalanced")}</option>
                      </select>
                    </label>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                      <div>
                        <dt className="text-fg-subtle">{t("storageOriginalSize")}</dt>
                        <dd className="font-semibold text-fg">{formatBytes(item.sourceBytes)}</dd>
                      </div>
                      <div>
                        <dt className="text-fg-subtle">
                          {t("storageCandidateSize", {
                            preset:
                              item.candidatePreset === "archive"
                                ? t("storagePresetArchiveShort")
                                : t("storagePresetBalancedShort")
                          })}
                        </dt>
                        <dd className="font-semibold text-fg">{formatBytes(item.candidateBytes)}</dd>
                      </div>
                      {item.finalBytes != null && (
                        <div>
                          <dt className="text-fg-subtle">{t("storageFinalSize")}</dt>
                          <dd className="font-semibold text-fg">{formatBytes(item.finalBytes)}</dd>
                        </div>
                      )}
                      {item.pendingBytes != null && (
                        <div>
                          <dt className="text-fg-subtle">{t("storagePendingSize")}</dt>
                          <dd className="font-semibold text-fg">{formatBytes(item.pendingBytes)}</dd>
                        </div>
                      )}
                    </dl>
                    <p
                      className={`text-xs sm:col-start-2 ${
                        item.candidateBytes <= item.sourceBytes
                          ? "text-success"
                          : "text-danger"
                      }`}
                    >
                      {item.candidateBytes <= item.sourceBytes
                        ? t("storageSavings", {
                            percent: Math.round(
                              (1 - item.candidateBytes / item.sourceBytes) * 100
                            )
                          })
                        : t("storageIncrease", {
                            amount: formatBytes(item.candidateBytes - item.sourceBytes)
                          })}
                    </p>
                  </div>
                )}

                {item.photoId && item.sourceBytes == null && item.state === "ready" && (
                  <p className="text-xs text-fg-subtle">{t("storageLegacyPending")}</p>
                )}
                {item.presetError && (
                  <p role="alert" className="text-xs text-danger">
                    {item.presetError === "quotaExceeded"
                      ? t("storagePresetQuotaError")
                      : item.presetError === "legacyPending"
                        ? t("storageLegacyPending")
                        : t("storagePresetError")}
                  </p>
                )}

                <div className="flex items-center justify-end gap-1">
                  {item.state === "failed" &&
                    item.file &&
                    (item.error === "unknown" ||
                      item.error === "quotaExceeded" ||
                      item.error === "queueFull") && (
                    <button
                      type="button"
                      onClick={() => retryQueuedFile(item)}
                      className={`${btnCls} min-h-8 px-2 py-1 max-sm:min-h-11`}
                    >
                      {t("retryPendingFile")}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={
                      finalizing ||
                      clearing ||
                      item.state === "uploading" ||
                      item.state === "optimizing" ||
                      item.state === "discarding"
                    }
                    aria-label={t("removePendingFile", { name: item.name })}
                    onClick={() => removeQueuedFile(item)}
                    className={`${btnCls} min-h-8 px-2 py-1 max-sm:min-h-11`}
                  >
                    {t("removePendingFileButton")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-pressed={mode === "single"}
          onClick={() => switchMode("single")}
          className={modeBtnCls(mode === "single")}
        >
          {t("singleCreditMode")}
        </button>
        <button
          type="button"
          aria-pressed={mode === "multiple"}
          onClick={() => switchMode("multiple")}
          className={modeBtnCls(mode === "multiple")}
        >
          {t("multipleCreditsMode")}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {rows.map((row) => (
          <div
            key={row.key}
            className="flex flex-col gap-2 rounded-lg border border-border-strong/50 p-2"
          >
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
              <label className="flex min-w-0 flex-col gap-1 text-xs text-fg-subtle">
                {t("creditName", { term: creditTerm })}
                <input
                  value={row.creditName}
                  onChange={(event) =>
                    updateRow(row.key, { creditName: event.target.value })
                  }
                  onBlur={(event) => syncLinksToName(row.key, event.target.value)}
                  maxLength={200}
                  list="known-credits"
                  className={inputCls}
                />
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-xs text-fg-subtle">
                {subjectTerm}
                <input
                  value={row.subject}
                  onChange={(event) =>
                    updateRow(row.key, { subject: event.target.value })
                  }
                  maxLength={200}
                  className={inputCls}
                />
              </label>
              {mode === "multiple" && rows.length > 1 && (
                <button
                  type="button"
                  aria-label={t("removeCreditAria", { term: creditTerm })}
                  onClick={() =>
                    setRows((current) =>
                      current.filter((candidate) => candidate.key !== row.key)
                    )
                  }
                  className={btnCls}
                >
                  ×
                </button>
              )}
            </div>
            <SocialLinksEditor
              links={row.socialLinks}
              onChange={(links) => updateRow(row.key, { socialLinks: links })}
            />
          </div>
        ))}
        {mode === "multiple" && (
          <button
            type="button"
            onClick={() => setRows((current) => [...current, emptyRow()])}
            className={`${btnCls} self-start`}
          >
            + {t("addCredit", { term: creditTerm })}
          </button>
        )}
      </div>
      <p className="-mt-1 text-xs text-fg-subtle">{t("batchCreditHint")}</p>

      <button
        type="button"
        disabled={!canCreate}
        onClick={handleCreate}
        className="self-start rounded-lg bg-fg px-5 py-2 text-sm font-semibold text-page transition hover:opacity-90 disabled:opacity-40"
      >
        {finalizing ? "…" : tc("create")}
      </button>

      {finalizeStatus?.kind === "success" && (
        <p role="status" className="text-sm text-success">
          {t("pendingCreated", { count: finalizeStatus.count })}
        </p>
      )}
      {finalizeStatus?.kind === "error" && (
        <p role="alert" className="text-sm font-medium text-danger">
          {finalizeStatus.message === "discard"
            ? t("pendingDiscardError")
            : t("pendingFinalizeError")}
        </p>
      )}
    </div>
  );
}
