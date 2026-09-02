ALTER TABLE "EquipmentChecklist" ADD COLUMN "bookingDayId" TEXT;

CREATE UNIQUE INDEX "EquipmentChecklist_bookingDayId_key"
ON "EquipmentChecklist"("bookingDayId");

ALTER TABLE "EquipmentChecklist"
ADD CONSTRAINT "EquipmentChecklist_bookingDayId_fkey"
FOREIGN KEY ("bookingDayId") REFERENCES "BookingDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;
