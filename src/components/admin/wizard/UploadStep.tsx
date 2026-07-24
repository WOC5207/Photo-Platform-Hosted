"use client";

import { useTranslations } from "next-intl";
import type { PendingUploadQueue, QueuedFile, StoragePreset } from "./usePendingUploadQueue";
import { btnCls, formatUploadLimit } from "./ui";

// Uploads always land as the recommended Balanced master; the storage-quality
// choice lives solely in the compression step to avoid two competing selectors.
const DEFAULT_UPLOAD_PRESET: StoragePreset = "balanced";

type AdminEventsTranslator = (
  key: string,
  values?: Record<string, string | number | Date>
) => string;

export function queueStateLabel(
  t: AdminEventsTranslator,
  item: QueuedFile
): string {
  if (item.state === "waiting") return t("pendingWaiting");
  if (item.state === "uploading") {
    const total = item.fileBytes ?? item.sourceBytes ?? 0;
    return total > 0 && (item.uploadedBytes ?? 0) >= total
      ? t("pendingProcessing")
      : t("pendingUploading");
  }
  // Transfer complete; the compression size is chosen in the next wizard step,
  // so from the upload step's point of view the file is simply uploaded.
  if (item.state === "awaiting") return t("pendingUploaded");
  if (item.state === "compressing") return t("pendingCompressing");
  if (item.state === "optimizing") return t("pendingOptimizing");
  if (item.state === "ready") return t("pendingReady");
  if (item.state === "discarding") return t("pendingRemoving");
  if (item.compressionFailed) return t("pendingErrorCompression");
  if (item.error === "quotaExceeded") return t("pendingErrorQuota");
  if (item.error === "queueFull") return t("pendingErrorQueueFull");
  if (item.error === "unsupportedType") return t("pendingErrorUnsupported");
  if (item.error === "tooLarge") return t("pendingErrorTooLarge");
  if (item.error === "invalidImage") return t("pendingErrorInvalid");
  return t("pendingErrorUnknown");
}

export default function UploadStep({
  queue,
  uploadMaxBytes
}: {
  queue: PendingUploadQueue;
  uploadMaxBytes: number;
}) {
  const t = useTranslations("adminEvents");
  const busy = queue.locked || queue.clearing;

  return (
    <div className="flex flex-col gap-3">
      <div
        id="wizard-upload-action"
        tabIndex={-1}
        className="grid scroll-mt-24 gap-3 rounded-xl border border-dashed border-border-strong p-4 outline-none transition data-[guidance-active=true]:ring-2 data-[guidance-active=true]:ring-fg/70 data-[guidance-active=true]:ring-offset-4 data-[guidance-active=true]:ring-offset-page sm:justify-items-start"
      >
        <label className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-fg px-4 py-2 text-sm font-semibold text-page transition hover:opacity-85 focus-within:ring-2 focus-within:ring-fg/40 sm:w-fit">
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/tiff,image/x-tiff,.tif,.tiff"
            disabled={busy}
            onChange={(event) =>
              queue.queueSelectedFiles(event, DEFAULT_UPLOAD_PRESET)
            }
            className="sr-only"
          />
          <span>+ {t("upload")}</span>
        </label>
        <p className="text-xs text-fg-subtle">{t("uploadHint")}</p>
        <p className="-mt-2 text-xs text-fg-subtle">
          {t("uploadSizeLimit", { maxSize: formatUploadLimit(uploadMaxBytes) })}
        </p>
      </div>

      {queue.oversizedSelectionCount > 0 && (
        <p role="alert" className="text-sm text-danger">
          {t("uploadSelectionTooLarge", {
            count: queue.oversizedSelectionCount,
            maxSize: formatUploadLimit(uploadMaxBytes)
          })}
        </p>
      )}
      {queue.discardError && (
        <p role="alert" className="text-sm font-medium text-danger">
          {t("pendingDiscardError")}
        </p>
      )}
      {queue.files.length === 0 && (
        <p role="status" className="text-sm text-fg-subtle">
          {t("noFilesSelected")}
        </p>
      )}

      {queue.files.length > 0 && (
        <section
          id="wizard-upload-status"
          tabIndex={-1}
          aria-labelledby="pending-upload-heading"
          className="scroll-mt-24 rounded-lg border border-border-strong/60 bg-surface/50 p-3 outline-none transition data-[guidance-active=true]:ring-2 data-[guidance-active=true]:ring-fg/70 data-[guidance-active=true]:ring-offset-4 data-[guidance-active=true]:ring-offset-page"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <h3 id="pending-upload-heading" className="text-sm font-semibold text-fg">
                {t("pendingQueue")}
              </h3>
              <span role="status" aria-live="polite" className="text-xs text-fg-subtle">
                {t("filesSelected", { count: queue.files.length })}
              </span>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void queue.clearQueue()}
              className={`${btnCls} min-h-8 px-2 py-1 max-sm:min-h-11`}
            >
              {queue.clearing ? "…" : t("clearPendingQueue")}
            </button>
          </div>
          <div className="mt-3" aria-live="polite">
            <div className="mb-1 flex items-center justify-between gap-3 text-xs text-fg-subtle">
              <span>{t("uploadProgressLabel")}</span>
              <span>
                {t("uploadProgress", {
                  completed: queue.uploadedCount,
                  total: queue.files.length,
                  percent: queue.uploadPercent
                })}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label={t("uploadProgressLabel")}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={queue.uploadPercent}
              className="h-2 overflow-hidden rounded-full bg-border"
            >
              <div
                className="h-full rounded-full bg-fg transition-[width] duration-200"
                style={{ width: `${queue.uploadPercent}%` }}
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-fg-subtle">{t("pendingStorageNotice")}</p>
          <ul data-testid="pending-photo-list" className="mt-3 space-y-3">
            {queue.files.map((item) => (
              <li
                key={item.key}
                className="grid gap-3 rounded-lg border border-border-strong/50 bg-page/60 p-3 text-sm text-fg-muted sm:grid-cols-[6rem_minmax(0,1fr)]"
              >
                <div className="aspect-[4/3] w-24 overflow-hidden rounded-lg border border-border bg-surface sm:w-full">
                  {item.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.previewUrl}
                      alt={item.name}
                      width={160}
                      height={120}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-fg-subtle">
                      {t("previewUnavailable")}
                    </div>
                  )}
                </div>

                <div className="min-w-0 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className="min-w-0 flex-1 break-words font-medium"
                      title={item.name}
                    >
                      {item.name}
                    </span>
                    <span
                      role="status"
                      className={
                        item.state === "failed"
                          ? "shrink-0 text-xs text-danger"
                          : "shrink-0 text-xs text-fg-subtle"
                      }
                    >
                      {queueStateLabel(t, item)}
                    </span>
                  </div>

                  <div className="flex items-center justify-end gap-1">
                    {item.state === "failed" &&
                      item.file &&
                      (item.error === "unknown" ||
                        item.error === "quotaExceeded" ||
                        item.error === "queueFull") && (
                        <button
                          type="button"
                          onClick={() => void queue.retryQueuedFile(item)}
                          className={`${btnCls} min-h-8 px-2 py-1 max-sm:min-h-11`}
                        >
                          {t("retryPendingFile")}
                        </button>
                      )}
                    {item.state === "failed" && item.compressionFailed && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void queue.retryCompression(item)}
                        className={`${btnCls} min-h-8 px-2 py-1 max-sm:min-h-11`}
                      >
                        {t("retryPendingFile")}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy || item.state === "discarding"}
                      aria-label={t("removePendingFile", { name: item.name })}
                      onClick={() => void queue.removeQueuedFile(item)}
                      className={`${btnCls} min-h-8 px-2 py-1 max-sm:min-h-11`}
                    >
                      {item.state === "uploading" ||
                      item.state === "optimizing" ||
                      item.state === "compressing"
                        ? t("cancelPendingFileButton")
                        : t("removePendingFileButton")}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
