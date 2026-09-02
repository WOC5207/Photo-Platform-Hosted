CREATE TABLE "EquipmentCategory" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EquipmentCategory_pkey" PRIMARY KEY ("id")
);

INSERT INTO "EquipmentCategory" (
  "id",
  "ownerId",
  "name",
  "normalizedName",
  "createdAt",
  "updatedAt"
)
SELECT
  md5("ownerId" || ':equipment-category:' || lower(COALESCE(NULLIF(btrim("category"), ''), 'Uncategorized'))),
  "ownerId",
  MIN(COALESCE(NULLIF(btrim("category"), ''), 'Uncategorized')),
  lower(COALESCE(NULLIF(btrim("category"), ''), 'Uncategorized')),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "EquipmentItem"
GROUP BY
  "ownerId",
  lower(COALESCE(NULLIF(btrim("category"), ''), 'Uncategorized'));

ALTER TABLE "EquipmentItem" ADD COLUMN "categoryId" TEXT;

UPDATE "EquipmentItem" AS equipment
SET "categoryId" = category."id"
FROM "EquipmentCategory" AS category
WHERE category."ownerId" = equipment."ownerId"
  AND category."normalizedName" = lower(
    COALESCE(NULLIF(btrim(equipment."category"), ''), 'Uncategorized')
  );

ALTER TABLE "EquipmentItem" ALTER COLUMN "categoryId" SET NOT NULL;
ALTER TABLE "EquipmentItem" DROP COLUMN "category";

CREATE UNIQUE INDEX "EquipmentCategory_ownerId_normalizedName_key"
ON "EquipmentCategory"("ownerId", "normalizedName");
CREATE INDEX "EquipmentCategory_ownerId_name_idx"
ON "EquipmentCategory"("ownerId", "name");
CREATE INDEX "EquipmentItem_categoryId_idx" ON "EquipmentItem"("categoryId");

ALTER TABLE "EquipmentCategory"
ADD CONSTRAINT "EquipmentCategory_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EquipmentItem"
ADD CONSTRAINT "EquipmentItem_categoryId_fkey"
FOREIGN KEY ("categoryId") REFERENCES "EquipmentCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
