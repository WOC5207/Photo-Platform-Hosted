CREATE TABLE "EquipmentItem" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT '',
  "serialNumber" TEXT NOT NULL DEFAULT '',
  "notes" TEXT NOT NULL DEFAULT '',
  "qrToken" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EquipmentItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EquipmentChecklist" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "shootDate" TIMESTAMP(3),
  "notes" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EquipmentChecklist_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EquipmentChecklistItem" (
  "id" TEXT NOT NULL,
  "checklistId" TEXT NOT NULL,
  "equipmentId" TEXT,
  "label" TEXT NOT NULL,
  "checked" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EquipmentChecklistItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EquipmentItem_qrToken_key" ON "EquipmentItem"("qrToken");
CREATE INDEX "EquipmentItem_ownerId_createdAt_idx" ON "EquipmentItem"("ownerId", "createdAt");
CREATE INDEX "EquipmentChecklist_ownerId_shootDate_idx" ON "EquipmentChecklist"("ownerId", "shootDate");
CREATE UNIQUE INDEX "EquipmentChecklistItem_checklistId_equipmentId_key" ON "EquipmentChecklistItem"("checklistId", "equipmentId");
CREATE INDEX "EquipmentChecklistItem_checklistId_sortOrder_idx" ON "EquipmentChecklistItem"("checklistId", "sortOrder");
CREATE INDEX "EquipmentChecklistItem_equipmentId_idx" ON "EquipmentChecklistItem"("equipmentId");

ALTER TABLE "EquipmentItem"
ADD CONSTRAINT "EquipmentItem_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EquipmentChecklist"
ADD CONSTRAINT "EquipmentChecklist_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EquipmentChecklistItem"
ADD CONSTRAINT "EquipmentChecklistItem_checklistId_fkey"
FOREIGN KEY ("checklistId") REFERENCES "EquipmentChecklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EquipmentChecklistItem"
ADD CONSTRAINT "EquipmentChecklistItem_equipmentId_fkey"
FOREIGN KEY ("equipmentId") REFERENCES "EquipmentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
