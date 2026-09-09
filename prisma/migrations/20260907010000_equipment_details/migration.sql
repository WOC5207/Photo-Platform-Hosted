CREATE TYPE "EquipmentStatus" AS ENUM ('SIGNED_OUT', 'IN_INVENTORY', 'MAINTENANCE', 'OTHER');

ALTER TABLE "EquipmentItem"
  ADD COLUMN "brand" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "model" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "status" "EquipmentStatus" NOT NULL DEFAULT 'IN_INVENTORY',
  ADD COLUMN "statusNote" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "photoToken" TEXT NOT NULL DEFAULT '';

-- Existing display names remain useful as the model until their owner adds
-- a manufacturer. This keeps every current inventory card identifiable.
UPDATE "EquipmentItem" SET "model" = "name" WHERE "model" = '';
