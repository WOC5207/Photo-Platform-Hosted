-- When the photographer last moved a slot to a new time. Visitors who booked
-- before then see a "time changed" notice on their booking page.
ALTER TABLE "TimeSlot" ADD COLUMN "rescheduledAt" TIMESTAMP(3);
