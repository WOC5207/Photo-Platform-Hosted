-- Platform-wide registration notice shown before a usable invite's account form.
CREATE TABLE "PlatformSettings" (
  "id" TEXT NOT NULL DEFAULT 'platform',
  "registrationNoticeEnabled" BOOLEAN NOT NULL DEFAULT false,
  "registrationNoticeDelaySeconds" INTEGER NOT NULL DEFAULT 5,
  "registrationNoticeTitleEn" TEXT NOT NULL DEFAULT '',
  "registrationNoticeTitleZh" TEXT NOT NULL DEFAULT '',
  "registrationNoticeBodyEn" TEXT NOT NULL DEFAULT '',
  "registrationNoticeBodyZh" TEXT NOT NULL DEFAULT '',
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlatformSettings_registration_notice_delay_check"
    CHECK ("registrationNoticeDelaySeconds" BETWEEN 0 AND 300)
);
