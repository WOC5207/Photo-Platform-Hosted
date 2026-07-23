ALTER TABLE "LotteryEntry" ADD COLUMN "contactMethodId" TEXT;

-- Recover a stable option identity for existing standalone entries whenever
-- their stored label still matches one of the draw owner's current labels.
UPDATE "LotteryEntry" AS entry
SET "contactMethodId" = (
  SELECT method.id
  FROM "ContactMethod" AS method
  JOIN "BookingEvent" AS event
    ON event."ownerId" = method."ownerId"
  JOIN "LotteryDraw" AS draw
    ON draw."bookingEventId" = event.id
  WHERE draw.id = entry."drawId"
    AND (
      method."labelEn" = entry."contactMethod"
      OR method."labelZh" = entry."contactMethod"
    )
  ORDER BY method."sortOrder" ASC, method."createdAt" ASC
  LIMIT 1
)
WHERE entry."bookingId" IS NULL
  AND entry."contactMethod" <> '';

CREATE INDEX "LotteryEntry_drawId_contactMethodId_idx"
ON "LotteryEntry"("drawId", "contactMethodId");
