-- Add the "awaiting" pending upload state. The source and thumbnail are stored
-- (so the photo is browsable and its transfer is complete), but the user has
-- not chosen a compression size yet, so no encode has started. Compression is
-- deferred until a size is picked in the wizard's compression step. This only
-- widens the allowed pending states, so it is additive and reprocesses nothing.

ALTER TABLE "Photo" DROP CONSTRAINT "Photo_upload_state_check";

ALTER TABLE "Photo" ADD CONSTRAINT "Photo_upload_state_check" CHECK (
  ("uploadState" = 'ready' AND "pendingBatchId" IS NULL)
  OR
  ("uploadState" IN ('awaiting', 'processing', 'pending', 'finalizing', 'deleting') AND "pendingBatchId" IS NOT NULL)
);
