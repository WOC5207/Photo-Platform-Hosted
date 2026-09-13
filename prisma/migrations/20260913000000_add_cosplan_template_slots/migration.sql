ALTER TABLE "CosplanTemplate"
ADD COLUMN "foregroundToken" TEXT,
ADD COLUMN "slots" JSONB,
ADD COLUMN "layoutVersion" INTEGER NOT NULL DEFAULT 1;
