-- Admin-controlled palette for the platform's own public pages.
ALTER TABLE "PlatformSettings"
  ADD COLUMN "publicBackgroundColor" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "publicSurfaceColor" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "publicFieldColor" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "publicTextColor" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "publicThemeColor" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "publicDarkBackgroundColor" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "publicDarkSurfaceColor" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "publicDarkFieldColor" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "publicDarkTextColor" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "publicDarkThemeColor" TEXT NOT NULL DEFAULT '';
