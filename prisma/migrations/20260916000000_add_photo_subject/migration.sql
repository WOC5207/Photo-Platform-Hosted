-- Subject detected on the -med rendition (libvips attention point plus a coarse
-- energy box), stored as fractions of the display-oriented image. All nullable
-- and unfilled here: rows are backfilled by a gentle sequential sweep after
-- boot, so this migration is instant. subjectVersion records the algorithm that
-- last ran; a NULL subjectX with a version means "attempted, nothing found".
ALTER TABLE "Photo"
  ADD COLUMN "subjectX" DOUBLE PRECISION,
  ADD COLUMN "subjectY" DOUBLE PRECISION,
  ADD COLUMN "subjectBoxX" DOUBLE PRECISION,
  ADD COLUMN "subjectBoxY" DOUBLE PRECISION,
  ADD COLUMN "subjectBoxWidth" DOUBLE PRECISION,
  ADD COLUMN "subjectBoxHeight" DOUBLE PRECISION,
  ADD COLUMN "subjectVersion" INTEGER;

CREATE INDEX "Photo_subjectVersion_idx" ON "Photo"("subjectVersion");
