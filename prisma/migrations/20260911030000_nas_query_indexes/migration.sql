-- Composite indexes for the public gallery and operational dashboard hot paths.
-- All changes are additive and can be built without rewriting table data.
CREATE INDEX "Event_ownerId_published_dateStart_createdAt_idx"
  ON "Event"("ownerId", "published", "dateStart", "createdAt");

CREATE INDEX "Photo_eventId_pendingBatchId_sortOrder_createdAt_id_idx"
  ON "Photo"("eventId", "pendingBatchId", "sortOrder", "createdAt", "id");

-- PostgreSQL-only partial indexes keep the public hot set small. Prisma does
-- not model partial indexes in schema.prisma, so these intentionally live only
-- in the additive SQL migration.
CREATE INDEX "Photo_public_ready_event_order_idx"
  ON "Photo"("eventId", "sortOrder", "createdAt", "id")
  WHERE "pendingBatchId" IS NULL
    AND "uploadState" = 'ready'
    AND "moderationStatus" IN ('not_required', 'approved');

CREATE INDEX "Event_public_owner_order_idx"
  ON "Event"("ownerId", "dateStart", "createdAt", "id")
  WHERE "published" = true;

CREATE INDEX "PhotoCredit_photoId_sortOrder_idx"
  ON "PhotoCredit"("photoId", "sortOrder");

CREATE INDEX "SocialLink_creditId_sortOrder_idx"
  ON "SocialLink"("creditId", "sortOrder");

CREATE INDEX "BookingEvent_ownerId_open_date_createdAt_idx"
  ON "BookingEvent"("ownerId", "open", "date", "createdAt");

CREATE INDEX "BookingEvent_open_owner_order_idx"
  ON "BookingEvent"("ownerId", "date", "createdAt", "id")
  WHERE "open" = true;

CREATE INDEX "TimeSlot_bookingDayId_startTime_id_idx"
  ON "TimeSlot"("bookingDayId", "startTime", "id");

CREATE INDEX "TimeSlot_bookingEventId_startTime_id_idx"
  ON "TimeSlot"("bookingEventId", "startTime", "id");

CREATE INDEX "Booking_timeSlotId_status_createdAt_idx"
  ON "Booking"("timeSlotId", "status", "createdAt");

CREATE INDEX "LotteryPrize_drawId_sortOrder_idx"
  ON "LotteryPrize"("drawId", "sortOrder");
