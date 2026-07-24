"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { config } from "@/lib/config";
import {
  thresholdsFromSettings,
  type ModerationThresholds
} from "@/lib/moderationPolicy";
import { enqueueModeration } from "@/lib/moderationWorker";

export type ModerationSettingsState = {
  ok?: boolean;
  error?: "validation" | "notConfigured";
};

function threshold(value: FormDataEntryValue | null): number | null | undefined {
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1
    ? parsed
    : undefined;
}

export async function saveModerationSettings(
  _previous: ModerationSettingsState,
  formData: FormData
): Promise<ModerationSettingsState> {
  await requireAdmin(await getLocale());
  const enabled = formData.get("enabled") === "on";
  if (enabled && !config.isOpenAIConfigured()) {
    return { error: "notConfigured" };
  }

  const values = {
    moderationThresholdSelfHarm: threshold(formData.get("selfHarm")),
    moderationThresholdSelfHarmIntent: threshold(formData.get("selfHarmIntent")),
    moderationThresholdSelfHarmInstructions: threshold(
      formData.get("selfHarmInstructions")
    ),
    moderationThresholdSexual: threshold(formData.get("sexual")),
    moderationThresholdViolence: threshold(formData.get("violence")),
    moderationThresholdViolenceGraphic: threshold(
      formData.get("violenceGraphic")
    )
  };
  if (Object.values(values).some((value) => value === undefined)) {
    return { error: "validation" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.platformSettings.upsert({
      where: { id: "platform" },
      create: { id: "platform" },
      update: {}
    });
    const rows = await tx.$queryRaw<
      {
        moderationEnabled: boolean;
        moderationPolicyVersion: number;
        moderationThresholdSelfHarm: number | null;
        moderationThresholdSelfHarmIntent: number | null;
        moderationThresholdSelfHarmInstructions: number | null;
        moderationThresholdSexual: number | null;
        moderationThresholdViolence: number | null;
        moderationThresholdViolenceGraphic: number | null;
      }[]
    >`SELECT * FROM "PlatformSettings" WHERE id = 'platform' FOR UPDATE`;
    const current = rows[0];
    const changed =
      current.moderationEnabled !== enabled ||
      Object.entries(values).some(
        ([key, value]) =>
          current[key as keyof typeof current] !== value
      );

    await tx.platformSettings.update({
      where: { id: "platform" },
      data: {
        moderationEnabled: enabled,
        ...values,
        moderationPolicyVersion:
          current.moderationPolicyVersion + (changed ? 1 : 0)
      }
    });
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

function noteFrom(formData: FormData): string {
  const value = formData.get("note");
  return typeof value === "string" ? value.trim().slice(0, 2000) : "";
}

export async function approveModeration(formData: FormData): Promise<void> {
  const admin = await requireAdmin(await getLocale());
  const reviewId = formData.get("reviewId");
  const note = noteFrom(formData);
  if (typeof reviewId !== "string") return;

  await prisma.$transaction(async (tx) => {
    const review = await tx.moderationReview.findFirst({
      where: {
        id: reviewId,
        status: "open",
        photo: { moderationStatus: "review_required" }
      },
      select: { id: true, photoId: true, providerFlagged: true }
    });
    if (!review || (review.providerFlagged && !note)) return;

    const claimed = await tx.moderationReview.updateMany({
      where: { id: review.id, status: "open" },
      data: { status: "approved" }
    });
    if (claimed.count !== 1) return;
    await tx.moderationDecision.create({
      data: {
        reviewId: review.id,
        reviewerId: admin.id,
        action: "approve",
        note
      }
    });
    await tx.photo.update({
      where: { id: review.photoId },
      data: { moderationStatus: "approved" }
    });
  });
  revalidatePath("/", "layout");
}

export async function rejectModeration(formData: FormData): Promise<void> {
  const admin = await requireAdmin(await getLocale());
  const reviewId = formData.get("reviewId");
  const note = noteFrom(formData);
  if (typeof reviewId !== "string") return;

  await prisma.$transaction(async (tx) => {
    const review = await tx.moderationReview.findFirst({
      where: {
        id: reviewId,
        status: "open",
        photo: { moderationStatus: "review_required" }
      },
      select: { id: true, photoId: true }
    });
    if (!review) return;
    const claimed = await tx.moderationReview.updateMany({
      where: { id: review.id, status: "open" },
      data: { status: "rejected" }
    });
    if (claimed.count !== 1) return;
    await tx.moderationDecision.create({
      data: {
        reviewId: review.id,
        reviewerId: admin.id,
        action: "reject",
        note
      }
    });
    await tx.photo.update({
      where: { id: review.photoId },
      data: { moderationStatus: "rejected", homeHighlight: false }
    });
  });
  revalidatePath("/", "layout");
}

export async function rescanModeration(formData: FormData): Promise<void> {
  const admin = await requireAdmin(await getLocale());
  const reviewId = formData.get("reviewId");
  const note = noteFrom(formData);
  if (
    typeof reviewId !== "string" ||
    !config.isOpenAIConfigured()
  ) {
    return;
  }

  const settings = await prisma.platformSettings.findUnique({
    where: { id: "platform" }
  });
  if (!settings?.moderationEnabled) return;
  const thresholds: ModerationThresholds = thresholdsFromSettings(settings);

  const photoId = await prisma.$transaction(async (tx) => {
    const review = await tx.moderationReview.findFirst({
      where: {
        id: reviewId,
        status: "open",
        photo: { moderationStatus: "review_required" }
      },
      select: { id: true, photoId: true }
    });
    if (!review) return null;
    const claimed = await tx.moderationReview.updateMany({
      where: { id: review.id, status: "open" },
      data: { status: "rescanning" }
    });
    if (claimed.count !== 1) return null;
    await tx.moderationDecision.create({
      data: {
        reviewId: review.id,
        reviewerId: admin.id,
        action: "rescan",
        note
      }
    });
    await tx.photo.update({
      where: { id: review.photoId },
      data: {
        moderationStatus: "queued",
        moderationPolicyVersion: settings.moderationPolicyVersion,
        moderationThresholds: thresholds,
        moderationAttempts: 0,
        moderationClaimedAt: null,
        moderationNextRetryAt: null
      }
    });
    return review.photoId;
  });
  if (photoId) enqueueModeration(photoId);
  revalidatePath("/", "layout");
}

export async function retryModerationErrors(): Promise<void> {
  await requireAdmin(await getLocale());
  if (!config.isOpenAIConfigured()) return;
  const settings = await prisma.platformSettings.findUnique({
    where: { id: "platform" }
  });
  if (!settings?.moderationEnabled) return;
  const thresholds = thresholdsFromSettings(settings);
  const errors = await prisma.photo.findMany({
    where: { moderationStatus: "error" },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: { id: true }
  });
  if (errors.length === 0) return;
  const ids = errors.map((photo) => photo.id);
  await prisma.photo.updateMany({
    where: { id: { in: ids }, moderationStatus: "error" },
    data: {
      moderationStatus: "queued",
      moderationPolicyVersion: settings.moderationPolicyVersion,
      moderationThresholds: thresholds,
      moderationAttempts: 0,
      moderationClaimedAt: null,
      moderationNextRetryAt: null
    }
  });
  ids.forEach(enqueueModeration);
  revalidatePath("/", "layout");
}
