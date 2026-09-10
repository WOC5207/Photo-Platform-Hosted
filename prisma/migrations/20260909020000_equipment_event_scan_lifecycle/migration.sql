-- Preserve an event's equipment journey independently from the shared
-- inventory status. Existing checklist rows start as planned because older
-- data did not record whether a status change belonged to this event.
CREATE TYPE "EquipmentChecklistState" AS ENUM ('PLANNED', 'AT_EVENT', 'RETURNED', 'BROKEN');

ALTER TABLE "EquipmentChecklistItem"
ADD COLUMN "eventState" "EquipmentChecklistState" NOT NULL DEFAULT 'PLANNED',
ADD COLUMN "signedOutAt" TIMESTAMP(3),
ADD COLUMN "returnedAt" TIMESTAMP(3),
ADD COLUMN "brokenAt" TIMESTAMP(3),
ADD COLUMN "lastScannedAt" TIMESTAMP(3);
