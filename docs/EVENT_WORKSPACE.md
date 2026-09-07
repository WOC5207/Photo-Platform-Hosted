# Unified event workspace

The Events sidebar entry now owns galleries, booking schedules and preparation.
New event creation uses one form and one database transaction to create:

1. An unpublished gallery with an owner-scoped slug.
2. A closed booking page with an independent, stable public token.
3. Booking days and one equipment checklist per selected date.

The shared event header links Gallery, Booking page, Booked slots and Equipment
checklist. Existing route URLs remain valid. Event-specific preparation routes
filter by an owned booking ID and reject inaccessible IDs rather than falling
back to all events.

The event index also exposes aggregate schedule/preparation tools. Equipment
inventory stays separate and supplies equipment to every event's packing lists.

## Existing data

The additive migration adds a nullable, unique gallery reference to BookingEvent.
It does not guess relationships between old records.

- Existing gallery-only records can explicitly set up booking and checklists.
  Existing photos, gallery slug and publication status remain unchanged.
- Existing booking-only records can explicitly create a linked draft gallery.
  Reservation IDs, public booking token and checklist packed state remain intact.
- Deleting either component preserves its partner. Deleting a booking still
  removes its slots, reservations and daily checklists via the existing cascades.
- Splitting a linked booking schedule creates a fresh draft gallery for the new
  schedule; original photos stay in the original gallery. Moving days preserves
  their checklist IDs. Schedule merges do not combine or delete gallery photos.
- New dates added to linked booking events automatically receive a checklist.
  Existing list items and their checked state are not reset.

Initial titles, location, descriptions and date range are copied at creation.
Gallery and booking-page settings remain separately editable; publishing either
is still explicit and booking opening still requires time slots.

## Checks

`scripts/test-event-workspace.ts` tests transaction rollback, draft defaults,
strict dates, all three resources, owner guards, legacy setup, slug uniqueness,
daily-list reuse and component deletion preservation. All fixture writes are
inside a transaction that is always rolled back.

```powershell
npx tsx --env-file-if-exists=.env --conditions=react-server scripts/test-event-workspace.ts
npx tsc --noEmit
```

Use a reachable migrated database. Local Docker preview builds run migrations
with `prisma migrate deploy` on startup.
