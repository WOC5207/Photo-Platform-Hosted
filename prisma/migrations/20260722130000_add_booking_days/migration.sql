-- Multi-day booking events: a BookingEvent now spans one or more BookingDays,
-- and each TimeSlot belongs to a day. Existing single-day events are backfilled
-- with one day at their current date, and their slots are repointed to it, so
-- the slot -> day link can then be made required. Additive: no data is dropped.

-- CreateTable
CREATE TABLE "BookingDay" (
    "id" TEXT NOT NULL,
    "bookingEventId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookingDay_bookingEventId_idx" ON "BookingDay"("bookingEventId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingDay_bookingEventId_date_key" ON "BookingDay"("bookingEventId", "date");

-- AddForeignKey
ALTER TABLE "BookingDay" ADD CONSTRAINT "BookingDay_bookingEventId_fkey" FOREIGN KEY ("bookingEventId") REFERENCES "BookingEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: slot -> day link, nullable while backfilling.
ALTER TABLE "TimeSlot" ADD COLUMN "bookingDayId" TEXT;

-- Backfill: one day per existing event, then repoint that event's slots. Every
-- existing event is single-day, so the join from slot to its event's lone day
-- is unambiguous.
INSERT INTO "BookingDay" ("id", "bookingEventId", "date", "createdAt")
SELECT gen_random_uuid()::text, e."id", e."date", CURRENT_TIMESTAMP
FROM "BookingEvent" e;

UPDATE "TimeSlot" ts
SET "bookingDayId" = bd."id"
FROM "BookingDay" bd
WHERE bd."bookingEventId" = ts."bookingEventId";

-- Now every slot has a day: make the link required and enforce it.
ALTER TABLE "TimeSlot" ALTER COLUMN "bookingDayId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "TimeSlot" ADD CONSTRAINT "TimeSlot_bookingDayId_fkey" FOREIGN KEY ("bookingDayId") REFERENCES "BookingDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;
