-- Existing gallery/booking URLs and records stay unchanged. Never infer pairs.
ALTER TABLE "BookingEvent" ADD COLUMN "galleryEventId" TEXT;
CREATE UNIQUE INDEX "BookingEvent_galleryEventId_key" ON "BookingEvent"("galleryEventId");
ALTER TABLE "BookingEvent" ADD CONSTRAINT "BookingEvent_galleryEventId_fkey"
  FOREIGN KEY ("galleryEventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
