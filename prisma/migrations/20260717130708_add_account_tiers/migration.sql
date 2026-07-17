-- Named storage tiers, plus a per-account override and an expiry date.

-- CreateTable
CREATE TABLE "Tier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quotaBytes" BIGINT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tier_name_key" ON "Tier"("name");

-- At most one default tier, enforced by the database rather than by hoping.
-- This is a PARTIAL unique index: it constrains only the rows where isDefault
-- is true, so any number of tiers may be non-default. Prisma's @unique cannot
-- express this (it would allow only one non-default tier — the opposite rule),
-- which is why this migration is hand-written.
CREATE UNIQUE INDEX "Tier_one_default" ON "Tier" ("isDefault") WHERE "isDefault";

-- The default tier has to exist before any account can resolve an allowance,
-- so it is seeded here rather than by application code that might not run.
-- 5 GiB matches the allowance every account had before tiers existed, so this
-- migration changes no one's actual limit.
INSERT INTO "Tier" ("id", "name", "quotaBytes", "isDefault", "sortOrder")
VALUES (gen_random_uuid()::text, 'Default', 5368709120, true, 0);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "tierExpiresAt" TIMESTAMP(3),
ADD COLUMN     "tierId" TEXT,
ALTER COLUMN "quotaBytes" DROP NOT NULL,
ALTER COLUMN "quotaBytes" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "Tier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- quotaBytes has changed meaning: it was every account's allowance, it is now
-- an override of the tier's. Anyone still on the old 5 GiB default had that
-- number by default rather than by decision, so they are moved onto the tier
-- (NULL = follow the tier). Anyone the admin had given a different number keeps
-- it, as an override — that number was a decision, and silently discarding it
-- would quietly change someone's limit.
UPDATE "User" SET "quotaBytes" = NULL WHERE "quotaBytes" = 5368709120;
