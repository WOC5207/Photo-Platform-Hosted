-- The admin-configured contact-method options are gone: the booking and
-- lottery-entry forms now collect a single free-text contact field
-- (contactValue). Drop the options table. Its "ownerId" index and the FK to
-- "User" drop with it. Historical snapshot columns are intentionally kept:
-- Booking.contactMethod and LotteryEntry.contactMethod/contactMethodId still
-- hold the method label past submissions were saved with.
DROP TABLE "ContactMethod";
