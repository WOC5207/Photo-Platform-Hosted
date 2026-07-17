-- Make the pending upload lifecycle explicit. Photo.id is also the
-- client-generated idempotency key for uploads, so a repeated request cannot
-- create a duplicate photo.

-- AlterTable
ALTER TABLE "Photo" ADD COLUMN "uploadState" TEXT NOT NULL DEFAULT 'ready';

-- Fail closed if an application path ever forgets to keep the visibility
-- marker and lifecycle state together.
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_upload_state_check" CHECK (
  ("uploadState" = 'ready' AND "pendingBatchId" IS NULL)
  OR
  ("uploadState" IN ('processing', 'pending', 'deleting') AND "pendingBatchId" IS NOT NULL)
);
