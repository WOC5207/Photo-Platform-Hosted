-- Photographers can turn off visitors' original-file downloads. On by default
-- so existing sites keep today's behaviour.
ALTER TABLE "SiteSettings" ADD COLUMN "originalDownloadsEnabled" BOOLEAN NOT NULL DEFAULT true;
