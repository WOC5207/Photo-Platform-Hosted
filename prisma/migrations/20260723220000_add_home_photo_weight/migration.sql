ALTER TABLE "Photo"
ADD COLUMN "homeWeight" INTEGER;

-- Give existing portfolios the same varied starting point as future uploads.
UPDATE "Photo"
SET "homeWeight" = (floor(random() * 5) + 1)::integer;

ALTER TABLE "Photo"
ALTER COLUMN "homeWeight" SET NOT NULL,
ALTER COLUMN "homeWeight" SET DEFAULT (floor(random() * 5) + 1)::integer;

ALTER TABLE "Photo"
ADD CONSTRAINT "Photo_homeWeight_check"
CHECK ("homeWeight" BETWEEN 1 AND 5);
