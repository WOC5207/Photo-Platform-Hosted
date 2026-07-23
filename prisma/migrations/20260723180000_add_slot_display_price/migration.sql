ALTER TABLE "BookingEvent"
ADD COLUMN "slotsInitialized" BOOLEAN NOT NULL DEFAULT false;

UPDATE "BookingEvent"
SET "slotsInitialized" = true
WHERE EXISTS (
  SELECT 1
  FROM "TimeSlot"
  WHERE "TimeSlot"."bookingEventId" = "BookingEvent"."id"
);

ALTER TABLE "TimeSlot"
ADD COLUMN "pricePerPerson" TEXT NOT NULL DEFAULT '';
