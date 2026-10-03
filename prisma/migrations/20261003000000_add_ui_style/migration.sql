-- Per-owner interface style: the classic UI or the archive design language.
ALTER TABLE "SiteSettings" ADD COLUMN "uiStyle" TEXT NOT NULL DEFAULT 'CLASSIC';
