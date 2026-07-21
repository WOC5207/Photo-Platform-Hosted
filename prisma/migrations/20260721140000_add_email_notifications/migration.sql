-- Optional email addresses for the email-notification system. Additive:
-- existing rows default to an empty string, meaning "no email" (in-app only),
-- which preserves the pre-email behaviour on deploys that never set SMTP.
--
-- User.email    — an account's contact address (owner booking alerts + admin
--                 announcements), set by the account holder in Account -> Profile.
-- Booking.email — an address the visitor optionally gives on the booking form so
--                 they get a confirmation and status updates by mail.

ALTER TABLE "User"
  ADD COLUMN "email" TEXT NOT NULL DEFAULT '';

ALTER TABLE "Booking"
  ADD COLUMN "email" TEXT NOT NULL DEFAULT '';
