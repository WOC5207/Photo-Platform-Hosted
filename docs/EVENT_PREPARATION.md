# Event preparation

The photographer dashboard separates inventory from shoot-day preparation.

- Equipment manages categories, equipment records, and QR labels only.
- Event preparation → Booked slots lists slots with confirmed bookings, with
  event, local date/time, location, capacity, subject and contact details.
  Filters support event and preparation status; results are paginated.
- Mark finished / Undo finished updates the slot's nullable `finishedAt`.
  It does not change booking confirmation, cancellation, or available capacity.
- Event preparation → Equipment checklist opens or creates one packing list
  per event day. The picker adds multiple owned inventory items at once.
  Separate packing lists, reminders, packed state, reset and deletion remain
  available in this area.

Existing checklist records are reused without copying or deleting them.
Booking editing links to preparation instead of duplicating checklist controls.
The additive migration adds only `TimeSlot.finishedAt`, initially null.

## Verification

`scripts/test-preparation.ts` exercises completion/undo, confirmed-only guards,
tenant isolation, bulk selection, duplicate suppression and preservation of
packed state. All fixtures are created inside an always-rolled-back transaction;
existing records are never modified. Run with a reachable migrated test database:

```powershell
npx tsx --env-file-if-exists=.env --conditions=react-server scripts/test-preparation.ts
```

Also run `npx tsc --noEmit` and the production build. Browser checks should cover
both languages, narrow layouts, event/status filtering, completion and undo,
daily list creation, equipment selection and packed-state toggling.
