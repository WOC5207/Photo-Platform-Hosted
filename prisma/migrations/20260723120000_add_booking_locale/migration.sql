-- The site language the visitor booked in, so their confirmation and any later
-- status-change email is sent in that language rather than bilingual. Existing
-- rows predate the choice, so they take the platform default locale ("zh").
ALTER TABLE "Booking" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'zh';
