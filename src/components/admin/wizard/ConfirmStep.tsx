"use client";

import { useTranslations } from "next-intl";
import { formatCredits } from "@/lib/content";
import PhotoCreditOverlay from "@/components/PhotoCreditOverlay";
import type {
  AssignedCredit,
  PendingUploadQueue,
  QueuedFile
} from "./usePendingUploadQueue";
import { formatBytes } from "./ui";

export interface CreditGroup {
  signature: string;
  credits: AssignedCredit[];
  items: (QueuedFile & { photoId: string })[];
}

/**
 * Groups ready photos by identical credit set, in order of first appearance.
 * Each group finalizes through one PATCH call (the endpoint applies a single
 * credit list to every photo it names).
 */
export function buildCreditGroups(
  photos: (QueuedFile & { photoId: string })[],
  creditsByPhoto: Record<string, AssignedCredit[]>
): CreditGroup[] {
  const groups = new Map<string, CreditGroup>();
  for (const item of photos) {
    const credits = creditsByPhoto[item.photoId] ?? [];
    const signature = JSON.stringify(credits);
    let group = groups.get(signature);
    if (!group) {
      group = { signature, credits, items: [] };
      groups.set(signature, group);
    }
    group.items.push(item);
  }
  return Array.from(groups.values());
}

export type PublishPhase = "idle" | "publishing" | "error" | "success";

export default function ConfirmStep({
  queue,
  creditsByPhoto,
  failedCount,
  publishPhase,
  publishedCount,
  moderationEnabled
}: {
  queue: PendingUploadQueue;
  creditsByPhoto: Record<string, AssignedCredit[]>;
  failedCount: number;
  publishPhase: PublishPhase;
  publishedCount: number;
  moderationEnabled: boolean;
}) {
  const tw = useTranslations("photoWizard");
  // Show every browsable photo (including any still compressing) so the preview
  // and counts reflect the whole batch; publishing itself waits for compression
  // to finish (queueWorking) before it can start.
  const photos = queue.browsableFiles;
  const groups = buildCreditGroups(photos, creditsByPhoto);
  const knownFinalBytes = photos
    .map((item) => item.finalBytes)
    .filter((bytes): bytes is number => bytes != null);
  const totalFinalBytes = knownFinalBytes.reduce((sum, bytes) => sum + bytes, 0);
  const finishingCompression = queue.queueWorking;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-fg-muted">{tw("confirmIntro")}</p>

      {moderationEnabled && (
        <p className="rounded-lg border border-accent/20 bg-accent-surface px-3 py-2 text-sm text-fg-muted">
          {tw("moderationDisclosure")}
        </p>
      )}

      <section
        aria-label={tw("albumPreview")}
        className="rounded-xl border border-border p-2"
      >
        {/* Same justified mosaic as the public AlbumViewer: flex-basis and
            flex-grow proportional to aspect ratio, so this previews the real
            album layout. */}
        <ul className="flex flex-wrap gap-1 [--row-h:110px] sm:[--row-h:150px] lg:[--row-h:180px]">
          {photos.map((item) => {
            const ar =
              item.width && item.height && item.height > 0
                ? item.width / item.height
                : 1;
            const caption = formatCredits(creditsByPhoto[item.photoId] ?? []);
            return (
              <li
                key={item.photoId}
                className="group relative overflow-hidden rounded-md"
                style={{ flexGrow: ar, flexBasis: `calc(${ar} * var(--row-h))` }}
              >
                {item.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.previewUrl}
                    alt={caption || item.name}
                    loading="lazy"
                    className="block h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full items-center justify-center text-xs text-fg-subtle">
                    {item.name}
                  </span>
                )}
                <PhotoCreditOverlay credit={caption} />
              </li>
            );
          })}
        </ul>
      </section>

      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-fg-subtle">{tw("summaryPhotos")}</dt>
          <dd className="font-semibold text-fg">{photos.length}</dd>
        </div>
        <div>
          <dt className="text-fg-subtle">{tw("summaryTotalLabel")}</dt>
          <dd className="font-semibold text-fg">{formatBytes(totalFinalBytes)}</dd>
        </div>
      </dl>

      <ul className="flex flex-col gap-1 text-sm text-fg-muted">
        {groups.map((group) => (
          <li key={group.signature}>
            {group.credits.length > 0
              ? tw("summaryGroup", {
                  caption: formatCredits(group.credits),
                  count: group.items.length
                })
              : tw("summaryGroupUncredited", { count: group.items.length })}
          </li>
        ))}
      </ul>

      {publishPhase === "error" && (
        <p role="alert" className="text-sm font-medium text-danger">
          {tw("publishError", { published: publishedCount })}
        </p>
      )}

      {failedCount > 0 && (
        <p role="alert" className="text-sm font-medium text-danger">
          {tw("resolveFailedFiles", { count: failedCount })}
        </p>
      )}

      {finishingCompression && publishPhase !== "publishing" && (
        <p role="status" className="text-sm text-fg-subtle">
          {tw("finishingCompression")}
        </p>
      )}
    </div>
  );
}
