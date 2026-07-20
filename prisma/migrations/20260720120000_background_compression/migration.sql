-- Background compression + pending photos excluded from the storage quota.
--
-- Additive only: existing rows keep their data. Pending photos previously
-- counted toward User.usedBytes; from now on their on-disk bytes are tracked in
-- the new User.pendingBytes and only charged to usedBytes at publish. Deploy
-- order: migrate -> deploy code -> run reconcile once so counters drop the
-- pending bytes they used to include and seed pendingBytes.

ALTER TABLE "User"
  ADD COLUMN "pendingBytes" BIGINT NOT NULL DEFAULT 0;

ALTER TABLE "Photo"
  ADD COLUMN "compressionClaimedAt" TIMESTAMP(3),
  ADD COLUMN "compressionFailed" BOOLEAN NOT NULL DEFAULT false;
