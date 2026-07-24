-- Add an opt-in, post-publish moderation lifecycle. Existing photos remain
-- explicitly exempt so deploying this migration never hides or rescans them.

ALTER TABLE "PlatformSettings"
  ADD COLUMN "moderationEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "moderationPolicyVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "moderationThresholdSelfHarm" DOUBLE PRECISION,
  ADD COLUMN "moderationThresholdSelfHarmIntent" DOUBLE PRECISION,
  ADD COLUMN "moderationThresholdSelfHarmInstructions" DOUBLE PRECISION,
  ADD COLUMN "moderationThresholdSexual" DOUBLE PRECISION,
  ADD COLUMN "moderationThresholdViolence" DOUBLE PRECISION,
  ADD COLUMN "moderationThresholdViolenceGraphic" DOUBLE PRECISION;

ALTER TABLE "Photo"
  ADD COLUMN "moderationStatus" TEXT NOT NULL DEFAULT 'not_required',
  ADD COLUMN "moderationPolicyVersion" INTEGER,
  ADD COLUMN "moderationThresholds" JSONB,
  ADD COLUMN "moderationClaimedAt" TIMESTAMP(3),
  ADD COLUMN "moderationNextRetryAt" TIMESTAMP(3),
  ADD COLUMN "moderationAttempts" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Photo" ADD CONSTRAINT "Photo_moderation_status_check" CHECK (
  "moderationStatus" IN (
    'not_required',
    'queued',
    'processing',
    'approved',
    'review_required',
    'rejected',
    'error'
  )
);

CREATE INDEX "Photo_moderationStatus_moderationNextRetryAt_idx"
  ON "Photo"("moderationStatus", "moderationNextRetryAt");

CREATE TABLE "ModerationScan" (
  "id" TEXT NOT NULL,
  "photoId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "requestedModel" TEXT NOT NULL,
  "returnedModel" TEXT NOT NULL,
  "policyVersion" INTEGER NOT NULL,
  "attempt" INTEGER NOT NULL,
  "providerFlagged" BOOLEAN NOT NULL,
  "categories" JSONB NOT NULL,
  "categoryScores" JSONB NOT NULL,
  "appliedInputTypes" JSONB NOT NULL,
  "thresholds" JSONB NOT NULL,
  "triggerReasons" JSONB NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ModerationScan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ModerationScan_photoId_createdAt_idx"
  ON "ModerationScan"("photoId", "createdAt");

CREATE TABLE "ModerationReview" (
  "id" TEXT NOT NULL,
  "photoId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "providerFlagged" BOOLEAN NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ModerationReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ModerationReview_photoId_key"
  ON "ModerationReview"("photoId");
CREATE INDEX "ModerationReview_status_createdAt_idx"
  ON "ModerationReview"("status", "createdAt");

CREATE TABLE "ModerationDecision" (
  "id" TEXT NOT NULL,
  "reviewId" TEXT NOT NULL,
  "reviewerId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "note" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ModerationDecision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ModerationDecision_reviewId_createdAt_idx"
  ON "ModerationDecision"("reviewId", "createdAt");
CREATE INDEX "ModerationDecision_reviewerId_idx"
  ON "ModerationDecision"("reviewerId");

ALTER TABLE "ModerationScan"
  ADD CONSTRAINT "ModerationScan_photoId_fkey"
  FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModerationReview"
  ADD CONSTRAINT "ModerationReview_photoId_fkey"
  FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModerationDecision"
  ADD CONSTRAINT "ModerationDecision_reviewId_fkey"
  FOREIGN KEY ("reviewId") REFERENCES "ModerationReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModerationDecision"
  ADD CONSTRAINT "ModerationDecision_reviewerId_fkey"
  FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
