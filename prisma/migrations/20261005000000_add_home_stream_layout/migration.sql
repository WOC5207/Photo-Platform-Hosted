-- Per-photographer layout for the public homepage photo stream.
ALTER TABLE "SiteSettings"
  ADD COLUMN "homeStreamLayout" TEXT NOT NULL DEFAULT 'GRID';
