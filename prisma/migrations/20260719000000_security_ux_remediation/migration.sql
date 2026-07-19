ALTER TABLE "PlatformSettings"
  ADD COLUMN "registrationNoticeMode" TEXT NOT NULL DEFAULT 'information',
  ADD COLUMN "registrationNoticeVersion" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "Invite"
  ADD COLUMN "consentNoticeVersion" INTEGER,
  ADD COLUMN "consentNoticeHash" TEXT,
  ADD COLUMN "consentLocale" TEXT,
  ADD COLUMN "consentAcceptedAt" TIMESTAMP(3);
