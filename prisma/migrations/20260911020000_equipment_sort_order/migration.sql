-- Preserve a photographer-defined inventory order without changing existing rows.
ALTER TABLE "EquipmentItem" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "EquipmentItem_ownerId_sortOrder_idx" ON "EquipmentItem"("ownerId", "sortOrder");
