CREATE TABLE "CosplanTemplate" (
    "id" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "titleZh" TEXT NOT NULL,
    "assetToken" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CosplanTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CosplanTemplateAsset" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CosplanTemplateAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CosplanTemplateAsset_token_key" ON "CosplanTemplateAsset"("token");
CREATE INDEX "CosplanTemplate_published_sortOrder_createdAt_idx" ON "CosplanTemplate"("published", "sortOrder", "createdAt");
CREATE INDEX "CosplanTemplateAsset_templateId_createdAt_idx" ON "CosplanTemplateAsset"("templateId", "createdAt");

ALTER TABLE "CosplanTemplateAsset" ADD CONSTRAINT "CosplanTemplateAsset_templateId_fkey"
FOREIGN KEY ("templateId") REFERENCES "CosplanTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
