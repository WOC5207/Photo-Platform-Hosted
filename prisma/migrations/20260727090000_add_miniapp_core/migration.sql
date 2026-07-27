-- Additive storage and opt-in gates for the WeChat mini-program visitor API.
-- Every switch and relation is fail-closed/nullable so deploying this migration
-- does not expose tenants or alter existing Web bookings and lottery entries.

ALTER TABLE "SiteSettings"
  ADD COLUMN "miniappEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "WeChatIdentity" (
  "id" TEXT NOT NULL,
  "appId" TEXT NOT NULL,
  "openId" TEXT NOT NULL,
  "unionId" TEXT,
  "userId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WeChatIdentity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MiniProgramSession" (
  "id" TEXT NOT NULL,
  "identityId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MiniProgramSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContentReport" (
  "id" TEXT NOT NULL,
  "photoId" TEXT NOT NULL,
  "wechatIdentityId" TEXT,
  "reason" TEXT NOT NULL,
  "details" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "reviewedById" TEXT,
  "resolutionNote" TEXT NOT NULL DEFAULT '',
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContentReport_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Booking"
  ADD COLUMN "wechatIdentityId" TEXT;

ALTER TABLE "LotteryEntry"
  ADD COLUMN "wechatIdentityId" TEXT;

CREATE UNIQUE INDEX "WeChatIdentity_appId_openId_key"
  ON "WeChatIdentity"("appId", "openId");
CREATE INDEX "WeChatIdentity_unionId_idx"
  ON "WeChatIdentity"("unionId");
CREATE INDEX "WeChatIdentity_userId_idx"
  ON "WeChatIdentity"("userId");

CREATE UNIQUE INDEX "MiniProgramSession_tokenHash_key"
  ON "MiniProgramSession"("tokenHash");
CREATE INDEX "MiniProgramSession_identityId_createdAt_idx"
  ON "MiniProgramSession"("identityId", "createdAt");
CREATE INDEX "MiniProgramSession_expiresAt_idx"
  ON "MiniProgramSession"("expiresAt");

CREATE INDEX "Booking_wechatIdentityId_idx"
  ON "Booking"("wechatIdentityId");
CREATE INDEX "LotteryEntry_wechatIdentityId_idx"
  ON "LotteryEntry"("wechatIdentityId");

-- PostgreSQL unique indexes already permit multiple NULL values, but the
-- explicit predicate documents and enforces exactly the intended invariant:
-- one attached WeChat identity per draw, without constraining legacy/Web rows.
CREATE UNIQUE INDEX "LotteryEntry_drawId_wechatIdentityId_key"
  ON "LotteryEntry"("drawId", "wechatIdentityId")
  WHERE "wechatIdentityId" IS NOT NULL;

CREATE INDEX "ContentReport_photoId_createdAt_idx"
  ON "ContentReport"("photoId", "createdAt");
CREATE INDEX "ContentReport_wechatIdentityId_idx"
  ON "ContentReport"("wechatIdentityId");
CREATE INDEX "ContentReport_status_createdAt_idx"
  ON "ContentReport"("status", "createdAt");

ALTER TABLE "WeChatIdentity"
  ADD CONSTRAINT "WeChatIdentity_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MiniProgramSession"
  ADD CONSTRAINT "MiniProgramSession_identityId_fkey"
  FOREIGN KEY ("identityId") REFERENCES "WeChatIdentity"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_wechatIdentityId_fkey"
  FOREIGN KEY ("wechatIdentityId") REFERENCES "WeChatIdentity"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LotteryEntry"
  ADD CONSTRAINT "LotteryEntry_wechatIdentityId_fkey"
  FOREIGN KEY ("wechatIdentityId") REFERENCES "WeChatIdentity"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ContentReport"
  ADD CONSTRAINT "ContentReport_photoId_fkey"
  FOREIGN KEY ("photoId") REFERENCES "Photo"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentReport"
  ADD CONSTRAINT "ContentReport_wechatIdentityId_fkey"
  FOREIGN KEY ("wechatIdentityId") REFERENCES "WeChatIdentity"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContentReport"
  ADD CONSTRAINT "ContentReport_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
