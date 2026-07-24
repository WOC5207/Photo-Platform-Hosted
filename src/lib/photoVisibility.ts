import type { Prisma } from "@prisma/client";

export const PUBLIC_MODERATION_STATUSES = [
  "not_required",
  "approved"
] as const;

/** Reusable fail-closed filter for every public photo query. */
export const publicPhotoWhere = {
  pendingBatchId: null,
  uploadState: "ready",
  moderationStatus: { in: [...PUBLIC_MODERATION_STATUSES] }
} satisfies Prisma.PhotoWhereInput;

export function moderationAllowsPublicPhoto(status: string): boolean {
  return status === "not_required" || status === "approved";
}
