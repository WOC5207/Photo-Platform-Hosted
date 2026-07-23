ALTER TABLE "PlatformSettings"
ADD COLUMN "bookingPriceNoticeTitleEn" TEXT NOT NULL DEFAULT '',
ADD COLUMN "bookingPriceNoticeTitleZh" TEXT NOT NULL DEFAULT '',
ADD COLUMN "bookingPriceNoticeBodyEn" TEXT NOT NULL DEFAULT '',
ADD COLUMN "bookingPriceNoticeBodyZh" TEXT NOT NULL DEFAULT '',
ADD COLUMN "bookingPriceNoticeVersion" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "SiteSettings"
ADD COLUMN "bookingPriceEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "bookingPriceNoticeAcceptedVersion" INTEGER,
ADD COLUMN "bookingPriceNoticeAcceptedLocale" TEXT,
ADD COLUMN "bookingPriceNoticeAcceptedAt" TIMESTAMP(3);
