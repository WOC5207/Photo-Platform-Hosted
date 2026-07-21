-- A free-text comment the photographer can attach to a photo, shown under the
-- credit/subject line and included in search. Additive; existing rows default
-- to an empty comment.

ALTER TABLE "Photo"
  ADD COLUMN "comment" TEXT NOT NULL DEFAULT '';
