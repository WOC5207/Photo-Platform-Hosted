-- Persist the source/candidate comparison for recoverable pending uploads.
-- Existing photos remain "original" and their files are not reprocessed.

ALTER TABLE "Photo"
  ADD COLUMN "storagePreset" TEXT NOT NULL DEFAULT 'original',
  ADD COLUMN "candidatePreset" TEXT,
  ADD COLUMN "sourceFilename" TEXT,
  ADD COLUMN "sourceBytes" INTEGER,
  ADD COLUMN "candidateBytes" INTEGER,
  ADD COLUMN "renditionBytes" INTEGER;

ALTER TABLE "Photo" DROP CONSTRAINT "Photo_upload_state_check";

ALTER TABLE "Photo" ADD CONSTRAINT "Photo_upload_state_check" CHECK (
  ("uploadState" = 'ready' AND "pendingBatchId" IS NULL)
  OR
  ("uploadState" IN ('processing', 'pending', 'finalizing', 'deleting') AND "pendingBatchId" IS NOT NULL)
);

ALTER TABLE "Photo" ADD CONSTRAINT "Photo_storage_preset_check" CHECK (
  "storagePreset" IN ('original', 'archive', 'balanced')
  AND ("candidatePreset" IS NULL OR "candidatePreset" IN ('archive', 'balanced'))
);
