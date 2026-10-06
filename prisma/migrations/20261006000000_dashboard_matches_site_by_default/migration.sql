-- Photographers' Dashboards wear their site colours by default; anyone who
-- prefers the neutral workspace can pick it again under Appearance.
ALTER TABLE "SiteSettings" ALTER COLUMN "dashboardThemeMode" SET DEFAULT 'MATCH_SITE';
UPDATE "SiteSettings" SET "dashboardThemeMode" = 'MATCH_SITE' WHERE "dashboardThemeMode" = 'PLATFORM';
