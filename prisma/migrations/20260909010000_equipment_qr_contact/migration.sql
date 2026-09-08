ALTER TABLE "SiteSettings"
  ADD COLUMN "equipmentContactMethod" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "equipmentContactLabel" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "equipmentContactValue" TEXT NOT NULL DEFAULT '';
