-- Photographer-owned poster projects. Exported JPEG/PNG files remain in the
-- browser and are deliberately not stored by the platform.
CREATE TABLE "SharingPoster" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "composition" JSONB NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SharingPoster_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SharingPoster_ownerId_updatedAt_id_idx"
  ON "SharingPoster"("ownerId", "updatedAt", "id");

ALTER TABLE "SharingPoster"
  ADD CONSTRAINT "SharingPoster_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
