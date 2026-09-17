-- Guided first-login tutorial (create an event, add photos). NULL = still to be
-- shown. Accounts that predate the tour have already found their way around,
-- so they are marked done here rather than greeted with it on their next visit;
-- the exception is an invited photographer who registered but has not finished
-- the setup wizard yet, who has never seen the dashboard and should get it.
ALTER TABLE "User" ADD COLUMN "tourCompletedAt" TIMESTAMP(3);

UPDATE "User" u
SET "tourCompletedAt" = CURRENT_TIMESTAMP
WHERE u."role" = 'admin'
   OR EXISTS (
     SELECT 1 FROM "SiteSettings" s
     WHERE s."ownerId" = u."id" AND s."setupCompleted" = true
   );
