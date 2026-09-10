-- Existing dashboards keep the platform palette until their owner opts in.
ALTER TABLE "SiteSettings"
ADD COLUMN "dashboardThemeMode" TEXT NOT NULL DEFAULT 'PLATFORM';
