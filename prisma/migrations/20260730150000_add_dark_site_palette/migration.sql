ALTER TABLE "SiteSettings"
ADD COLUMN "darkBackgroundColor" TEXT NOT NULL DEFAULT '',
ADD COLUMN "darkSurfaceColor" TEXT NOT NULL DEFAULT '',
ADD COLUMN "darkFieldColor" TEXT NOT NULL DEFAULT '',
ADD COLUMN "darkTextColor" TEXT NOT NULL DEFAULT '',
ADD COLUMN "darkThemeColor" TEXT NOT NULL DEFAULT '';

-- The former single palette applied in both modes. Copy it into the new dark
-- namespace so established sites do not unexpectedly change after deployment.
UPDATE "SiteSettings"
SET
  "darkBackgroundColor" = "backgroundColor",
  "darkSurfaceColor" = "surfaceColor",
  "darkFieldColor" = "fieldColor",
  "darkTextColor" = "textColor",
  "darkThemeColor" = "themeColor";
