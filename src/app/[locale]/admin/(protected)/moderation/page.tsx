import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { config } from "@/lib/config";
import { getPlatformSettings } from "@/lib/platformSettings";
import { photoUrls } from "@/lib/images";
import { ownerName } from "@/lib/owner";
import {
  IMAGE_MODERATION_CATEGORIES,
  type ImageModerationCategory
} from "@/lib/moderationPolicy";
import ModerationSettingsForm from "@/components/admin/ModerationSettingsForm";
import ModerationReviewImage from "@/components/admin/ModerationReviewImage";
import ConfirmSubmit from "@/components/admin/ConfirmSubmit";
import {
  approveModeration,
  rejectModeration,
  rescanModeration
} from "./actions";

export const dynamic = "force-dynamic";

interface ReasonRow {
  type: string;
  category?: ImageModerationCategory;
  score?: number;
  threshold?: number;
}

function reasonRows(value: unknown): ReasonRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const raw = item as Record<string, unknown>;
    const category =
      typeof raw.category === "string" &&
      (IMAGE_MODERATION_CATEGORIES as readonly string[]).includes(raw.category)
        ? (raw.category as ImageModerationCategory)
        : undefined;
    return [
      {
        type: typeof raw.type === "string" ? raw.type : "unknown",
        category,
        score: typeof raw.score === "number" ? raw.score : undefined,
        threshold:
          typeof raw.threshold === "number" ? raw.threshold : undefined
      }
    ];
  });
}

export default async function ModerationPage() {
  const locale = await getLocale();
  await requireAdmin(locale);
  const t = await getTranslations("adminModeration");
  const tc = await getTranslations("common");

  const [settings, reviews] = await Promise.all([
    getPlatformSettings(),
    prisma.moderationReview.findMany({
      where: {
        status: "open",
        photo: { moderationStatus: "review_required" }
      },
      orderBy: { createdAt: "asc" },
      include: {
        photo: {
          include: {
            event: {
              include: {
                owner: {
                  select: {
                    username: true,
                    displayName: true
                  }
                }
              }
            },
            moderationScans: {
              orderBy: { createdAt: "desc" },
              take: 1
            }
          }
        }
      }
    })
  ]);

  const categoryLabels: Record<ImageModerationCategory, string> = {
    "self-harm": t("categorySelfHarm"),
    "self-harm/intent": t("categorySelfHarmIntent"),
    "self-harm/instructions": t("categorySelfHarmInstructions"),
    sexual: t("categorySexual"),
    violence: t("categoryViolence"),
    "violence/graphic": t("categoryViolenceGraphic")
  };
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short"
  });
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const queueAge = (createdAt: Date) => {
    const elapsedMinutes = Math.max(
      0,
      Math.floor((Date.now() - createdAt.getTime()) / 60_000)
    );
    if (elapsedMinutes < 60) return relative.format(-elapsedMinutes, "minute");
    const elapsedHours = Math.floor(elapsedMinutes / 60);
    if (elapsedHours < 48) return relative.format(-elapsedHours, "hour");
    return date.format(createdAt);
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-sm text-fg-subtle">{t("subtitle")}</p>
      </div>

      <ModerationSettingsForm
        settings={settings}
        configured={config.isOpenAIConfigured()}
      />

      <section className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">{t("queueTitle")}</h2>
            <p className="mt-1 text-sm text-fg-subtle">{t("queueDescription")}</p>
          </div>
          <span className="rounded-full bg-fg/10 px-3 py-1 text-sm font-semibold">
            {reviews.length}
          </span>
        </div>

        {reviews.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface p-8 text-center text-sm text-fg-subtle">
            {t("queueEmpty")}
          </p>
        ) : (
          <ul className="grid gap-4 lg:grid-cols-2">
            {reviews.map((review) => {
              const photo = review.photo;
              const scan = photo.moderationScans[0];
              const reasons = reasonRows(scan?.triggerReasons);
              return (
                <li
                  key={review.id}
                  className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4"
                >
                  <ModerationReviewImage
                    src={photoUrls(photo.eventId, photo.id).med}
                    alt={photo.originalName}
                  />

                  <div>
                    <p className="font-semibold">{photo.originalName}</p>
                    <p className="mt-1 text-xs text-fg-subtle">
                      {ownerName(photo.event.owner)} · {photo.event.titleEn || photo.event.titleZh}
                    </p>
                    <p className="mt-1 text-xs text-fg-subtle">
                      {t("queuedAt", { age: queueAge(review.createdAt) })}
                    </p>
                  </div>

                  <div className="rounded-lg border border-border bg-page p-3">
                    <p className="text-sm font-semibold">{t("whyFlagged")}</p>
                    <ul className="mt-2 space-y-1 text-xs text-fg-muted">
                      {reasons.map((reason, index) => (
                        <li key={`${reason.type}-${reason.category ?? "all"}-${index}`}>
                          {reason.type === "provider_flag" &&
                            t("providerFlagReason")}
                          {reason.type === "category_flag" &&
                            reason.category &&
                            t("categoryFlagReason", {
                              category: categoryLabels[reason.category],
                              score: reason.score?.toFixed(3) ?? "—"
                            })}
                          {reason.type === "threshold" &&
                            reason.category &&
                            t("thresholdReason", {
                              category: categoryLabels[reason.category],
                              score: reason.score?.toFixed(3) ?? "—",
                              threshold: reason.threshold?.toFixed(3) ?? "—"
                            })}
                        </li>
                      ))}
                    </ul>
                    {scan && (
                      <dl className="mt-3 grid gap-2 border-t border-border pt-3 text-xs sm:grid-cols-2">
                        <div>
                          <dt className="text-fg-subtle">{t("model")}</dt>
                          <dd className="break-all text-fg-muted">{scan.returnedModel}</dd>
                        </div>
                        <div>
                          <dt className="text-fg-subtle">{t("policyVersion")}</dt>
                          <dd className="text-fg-muted">{scan.policyVersion}</dd>
                        </div>
                      </dl>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <form action={approveModeration} className="flex flex-col gap-2">
                      <input type="hidden" name="reviewId" value={review.id} />
                      <label className="text-xs text-fg-subtle">
                        {t("reviewerNote")}
                        <textarea
                          name="note"
                          rows={2}
                          maxLength={2000}
                          required={review.providerFlagged}
                          className="mt-1 w-full rounded-lg border border-border-strong bg-page px-3 py-2 text-sm text-fg"
                        />
                      </label>
                      <button
                        type="submit"
                        className="min-h-10 rounded-lg bg-fg px-3 py-2 text-sm font-semibold text-page"
                      >
                        {t("approve")}
                      </button>
                    </form>
                    <form action={rejectModeration} className="flex flex-col gap-2">
                      <input type="hidden" name="reviewId" value={review.id} />
                      <label className="text-xs text-fg-subtle">
                        {t("reviewerNote")}
                        <textarea
                          name="note"
                          rows={2}
                          maxLength={2000}
                          className="mt-1 w-full rounded-lg border border-border-strong bg-page px-3 py-2 text-sm text-fg"
                        />
                      </label>
                      <ConfirmSubmit
                        label={t("reject")}
                        confirmText={t("rejectConfirm")}
                      />
                    </form>
                  </div>
                  <form action={rescanModeration}>
                    <input type="hidden" name="reviewId" value={review.id} />
                    <button
                      type="submit"
                      className="min-h-10 rounded-lg border border-border-strong px-3 py-2 text-sm font-semibold text-fg-muted hover:text-fg"
                    >
                      {t("rescan")}
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
