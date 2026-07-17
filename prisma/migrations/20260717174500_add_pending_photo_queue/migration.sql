-- Photos selected in the event editor are uploaded and processed immediately,
-- then remain private until the owner finalizes the batch with shared credits.

-- AlterTable
ALTER TABLE "Photo" ADD COLUMN "pendingBatchId" TEXT;

-- CreateIndex
CREATE INDEX "Photo_eventId_pendingBatchId_idx" ON "Photo"("eventId", "pendingBatchId");
