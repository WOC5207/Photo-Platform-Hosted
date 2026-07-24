import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { photoUrls } from "@/lib/images";
import { ownerName } from "@/lib/owner";
import {
  IMAGE_MODERATION_CATEGORIES,
  type ImageModerationCategory
} from "@/lib/moderationPolicy";
import ModerationReviewImage from "./ModerationReviewImage";

export interface ModerationAuditPhoto {
  id: string;
  eventId: string;
  filename: string;
  originalName: string;
  width: number;
  height: number;
  bytes: number;
  storagePreset: string;
  createdAt: Date;
  exifTakenAt: Date | null;
  exifCameraModel: string | null;
  exifLensModel: string | null;
  moderationStatus: string;
  moderationAttempts: number;
  event: {
    titleEn: string;
    titleZh: string;
    owner: {
      username: string;
      displayName: string;
    };
  };
  moderationScans: Array<{
    requestId: string;
    returnedModel: string;
    policyVersion: number;
    attempt: number;
    providerFlagged: boolean;
    categories: unknown;
    categoryScores: unknown;
    appliedInputTypes: unknown;
    thresholds: unknown;
    completedAt: Date;
  }>;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function formatBytes(bytes: number, locale: string): string {
  if (bytes < 1024) return `${bytes.toLocaleString(locale)} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && value >= 1024; index++) {
    value /= 1024;
    unit = units[index];
  }
  return `${value.toLocaleString(locale, {
    maximumFractionDigits: 1
  })} ${unit}`;
}

function scoreRows(scan: ModerationAuditPhoto["moderationScans"][number]) {
  const scores = record(scan.categoryScores);
  const flags = record(scan.categories);
  const appliedInputTypes = record(scan.appliedInputTypes);
  const thresholds = record(scan.thresholds);

  return IMAGE_MODERATION_CATEGORIES.flatMap((category) => {
    const applied = appliedInputTypes[category];
    const score = scores[category];
    if (
      !Array.isArray(applied) ||
      !applied.includes("image") ||
      typeof score !== "number" ||
      !Number.isFinite(score)
    ) {
      return [];
    }
    const threshold = thresholds[category];
    return [
      {
        category,
        score,
        threshold:
          typeof threshold === "number" && Number.isFinite(threshold)
            ? threshold
            : null,
        providerFlagged: flags[category] === true
      }
    ];
  });
}

export default async function ModerationPhotoAudit({
  photos,
  total,
  page,
  pageSize,
  locale
}: {
  photos: ModerationAuditPhoto[];
  total: number;
  page: number;
  pageSize: number;
  locale: string;
}) {
  const t = await getTranslations("adminModeration");
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short"
  });
  const categoryLabels: Record<ImageModerationCategory, string> = {
    "self-harm": t("categorySelfHarm"),
    "self-harm/intent": t("categorySelfHarmIntent"),
    "self-harm/instructions": t("categorySelfHarmInstructions"),
    sexual: t("categorySexual"),
    violence: t("categoryViolence"),
    "violence/graphic": t("categoryViolenceGraphic")
  };
  const statusLabels: Record<string, string> = {
    not_required: t("statusNotRequired"),
    queued: t("statusQueued"),
    processing: t("statusProcessing"),
    approved: t("statusApproved"),
    review_required: t("statusReviewRequired"),
    rejected: t("statusRejected"),
    error: t("statusError")
  };
  const storageLabels: Record<string, string> = {
    original: t("storageOriginal"),
    archive: t("storageArchive"),
    balanced: t("storageBalanced")
  };
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const effectivePage = Math.min(page, pageCount);
  const first = total === 0 ? 0 : (effectivePage - 1) * pageSize + 1;
  const last = Math.min(effectivePage * pageSize, total);

  return (
    <section className="flex flex-col gap-4" aria-labelledby="photo-audit-title">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="photo-audit-title" className="text-lg font-semibold">
            {t("photoDetailsTitle")}
          </h2>
          <p className="mt-1 text-sm text-fg-subtle">
            {t("photoDetailsDescription")}
          </p>
        </div>
        <p className="text-sm font-semibold text-fg-muted">
          {t("photoDetailsRange", { first, last, total })}
        </p>
      </div>

      {photos.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-8 text-center text-sm text-fg-subtle">
          {t("photoDetailsEmpty")}
        </p>
      ) : (
        <ul className="grid gap-4 xl:grid-cols-2">
          {photos.map((photo) => {
            const scan = photo.moderationScans[0];
            const scores = scan ? scoreRows(scan) : [];
            const megapixels = (photo.width * photo.height) / 1_000_000;
            const orientation =
              photo.width === photo.height
                ? t("orientationSquare")
                : photo.width > photo.height
                  ? t("orientationLandscape")
                  : t("orientationPortrait");
            const eventTitle =
              (locale.startsWith("zh") ? photo.event.titleZh : photo.event.titleEn) ||
              photo.event.titleEn ||
              photo.event.titleZh;

            return (
              <li
                key={photo.id}
                className="grid gap-4 rounded-xl border border-border bg-surface p-4 md:grid-cols-[minmax(12rem,0.8fr)_minmax(0,1.2fr)]"
              >
                <div className="flex min-w-0 flex-col gap-3">
                  <ModerationReviewImage
                    src={photoUrls(photo.eventId, photo.id).thumb}
                    alt={photo.originalName}
                  />
                  <dl className="min-w-0 space-y-2 text-xs">
                    <div>
                      <dt className="text-fg-subtle">
                        {t("photoOriginalName")}
                      </dt>
                      <dd className="break-all text-sm font-semibold text-fg">
                        {photo.originalName}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-fg-subtle">
                        {t("photoStoredName")}
                      </dt>
                      <dd className="break-all font-mono text-fg-muted">
                        {photo.filename}
                      </dd>
                    </div>
                  </dl>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                    <div>
                      <dt className="text-fg-subtle">{t("photoSize")}</dt>
                      <dd className="font-medium text-fg">
                        {formatBytes(photo.bytes, locale)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-fg-subtle">{t("photoResolution")}</dt>
                      <dd className="font-medium text-fg">
                        {photo.width.toLocaleString(locale)} ×{" "}
                        {photo.height.toLocaleString(locale)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-fg-subtle">{t("photoMegapixels")}</dt>
                      <dd className="font-medium text-fg">
                        {megapixels.toLocaleString(locale, {
                          maximumFractionDigits: 1
                        })}{" "}
                        MP
                      </dd>
                    </div>
                    <div>
                      <dt className="text-fg-subtle">{t("photoOrientation")}</dt>
                      <dd className="font-medium text-fg">{orientation}</dd>
                    </div>
                    <div>
                      <dt className="text-fg-subtle">{t("photoStoragePreset")}</dt>
                      <dd className="font-medium text-fg">
                        {storageLabels[photo.storagePreset] ?? photo.storagePreset}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-fg-subtle">{t("photoUploadedAt")}</dt>
                      <dd className="font-medium text-fg">
                        {date.format(photo.createdAt)}
                      </dd>
                    </div>
                  </dl>
                  {(photo.exifCameraModel ||
                    photo.exifLensModel ||
                    photo.exifTakenAt) && (
                    <dl className="border-t border-border pt-3 text-xs">
                      {photo.exifCameraModel && (
                        <div className="mb-1">
                          <dt className="inline text-fg-subtle">
                            {t("photoCamera")}:{" "}
                          </dt>
                          <dd className="inline text-fg">
                            {photo.exifCameraModel}
                          </dd>
                        </div>
                      )}
                      {photo.exifLensModel && (
                        <div className="mb-1">
                          <dt className="inline text-fg-subtle">
                            {t("photoLens")}:{" "}
                          </dt>
                          <dd className="inline text-fg">{photo.exifLensModel}</dd>
                        </div>
                      )}
                      {photo.exifTakenAt && (
                        <div>
                          <dt className="inline text-fg-subtle">
                            {t("photoCapturedAt")}:{" "}
                          </dt>
                          <dd className="inline text-fg">
                            {date.format(photo.exifTakenAt)}
                          </dd>
                        </div>
                      )}
                    </dl>
                  )}
                </div>

                <div className="flex min-w-0 flex-col gap-3">
                  <div className="rounded-lg border border-border bg-page p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">
                        {t("photoModerationDetails")}
                      </p>
                      <span className="rounded-full bg-fg/10 px-2.5 py-1 text-xs font-semibold text-fg">
                        {statusLabels[photo.moderationStatus] ??
                          photo.moderationStatus}
                      </span>
                    </div>

                    {scan ? (
                      <>
                        <div className="mt-3 overflow-x-auto">
                          <table className="w-full min-w-[28rem] text-left text-xs">
                            <thead className="text-fg-subtle">
                              <tr>
                                <th scope="col" className="pb-2 pr-3 font-medium">
                                  {t("scoreCategory")}
                                </th>
                                <th scope="col" className="pb-2 pr-3 font-medium">
                                  {t("scoreValue")}
                                </th>
                                <th scope="col" className="pb-2 pr-3 font-medium">
                                  {t("scoreThreshold")}
                                </th>
                                <th scope="col" className="pb-2 font-medium">
                                  {t("scoreProviderFlag")}
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {scores.map((row) => (
                                <tr
                                  key={row.category}
                                  className="border-t border-border"
                                >
                                  <th
                                    scope="row"
                                    className="py-2 pr-3 font-medium text-fg"
                                  >
                                    {categoryLabels[row.category]}
                                  </th>
                                  <td className="py-2 pr-3 font-mono text-fg">
                                    {row.score.toFixed(4)}
                                  </td>
                                  <td className="py-2 pr-3 text-fg-muted">
                                    {row.threshold == null
                                      ? t("providerOnly")
                                      : row.threshold.toFixed(4)}
                                  </td>
                                  <td className="py-2 text-fg-muted">
                                    {row.providerFlagged
                                      ? t("answerYes")
                                      : t("answerNo")}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <dl className="mt-3 grid gap-2 border-t border-border pt-3 text-xs sm:grid-cols-2">
                          <div>
                            <dt className="text-fg-subtle">{t("model")}</dt>
                            <dd className="break-all text-fg-muted">
                              {scan.returnedModel}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-fg-subtle">
                              {t("photoScreenedAt")}
                            </dt>
                            <dd className="text-fg-muted">
                              {date.format(scan.completedAt)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-fg-subtle">
                              {t("policyVersion")}
                            </dt>
                            <dd className="text-fg-muted">{scan.policyVersion}</dd>
                          </div>
                          <div>
                            <dt className="text-fg-subtle">
                              {t("photoScanAttempt")}
                            </dt>
                            <dd className="text-fg-muted">{scan.attempt}</dd>
                          </div>
                          <div>
                            <dt className="text-fg-subtle">
                              {t("photoOverallProviderFlag")}
                            </dt>
                            <dd className="text-fg-muted">
                              {scan.providerFlagged
                                ? t("answerYes")
                                : t("answerNo")}
                            </dd>
                          </div>
                          <div className="sm:col-span-2">
                            <dt className="text-fg-subtle">
                              {t("photoRequestId")}
                            </dt>
                            <dd className="break-all font-mono text-fg-muted">
                              {scan.requestId}
                            </dd>
                          </div>
                        </dl>
                      </>
                    ) : (
                      <p className="mt-3 text-sm text-fg-subtle">
                        {t("photoNoScan")}
                      </p>
                    )}
                  </div>

                  <dl className="grid gap-2 rounded-lg border border-border bg-page p-3 text-xs sm:grid-cols-2">
                    <div>
                      <dt className="text-fg-subtle">{t("photoPhotographer")}</dt>
                      <dd className="text-fg">
                        {ownerName(photo.event.owner)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-fg-subtle">{t("photoEvent")}</dt>
                      <dd className="text-fg">{eventTitle || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-fg-subtle">{t("photoId")}</dt>
                      <dd className="break-all font-mono text-fg-muted">
                        {photo.id}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-fg-subtle">
                        {t("photoModerationAttempts")}
                      </dt>
                      <dd className="text-fg-muted">
                        {photo.moderationAttempts}
                      </dd>
                    </div>
                  </dl>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {pageCount > 1 && (
        <nav
          aria-label={t("photoDetailsPagination")}
          className="flex items-center justify-between gap-3"
        >
          {effectivePage > 1 ? (
            <Link
              href={`/admin/moderation?details=1&photoPage=${effectivePage - 1}`}
              className="inline-flex min-h-10 items-center rounded-lg border border-border-strong px-3 py-2 text-sm font-semibold text-fg-muted hover:text-fg"
            >
              {t("previousPage")}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-fg-subtle">
            {t("photoDetailsPage", {
              page: effectivePage,
              total: pageCount
            })}
          </span>
          {effectivePage < pageCount ? (
            <Link
              href={`/admin/moderation?details=1&photoPage=${effectivePage + 1}`}
              className="inline-flex min-h-10 items-center rounded-lg border border-border-strong px-3 py-2 text-sm font-semibold text-fg-muted hover:text-fg"
            >
              {t("nextPage")}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </section>
  );
}
