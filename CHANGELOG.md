# Changelog

## v2.0.0 — multi-tenant

Turns the single-photographer site below into a platform: many photographers,
each with their own site, all hosted from one NAS. Breaking in every sense —
different database, different URLs, different account model. There is no upgrade
path from v1.0.0 and none is intended; this fork starts from an empty database.

### Platform

- **Many accounts, one deployment.** Every photographer gets their own site at
  `/u/<username>` — homepage, gallery, albums, booking, branding and feature
  toggles, all their own. The root of the domain is a directory of everyone
  hosted there. The admin's own photography lives at `/u/<their-username>` like
  anyone else's; there is no privileged site.
- **Invite-only registration.** No public signup form exists. The admin issues a
  single-use link from Admin → Invites; redemption is row-locked, so a shared
  link cannot be redeemed twice.
- **Per-account storage quotas.** The admin sets an allowance per account;
  photographers see their usage against it and uploads are refused once it is
  reached. Deleting frees it again. The counter is checked and claimed in one
  statement, so concurrent uploads cannot both slip under the same limit.
- **Account isolation.** Content is owned. One photographer cannot read or touch
  another's albums, bookings, credit profiles, originals or unpublished work.
  Suspending an account takes its public site down — pages and images alike,
  including image URLs already shared — and ends its session on the next request
  rather than whenever its cookie expires.
- **Platform administration** at `/admin`: accounts (suspend, delete, set
  quota), invites, and storage across every account. The only place a role
  decides anything.

### Under the hood

- **SQLite → PostgreSQL**, as a second container in the same compose project.
  The NAS deployment story is unchanged; the database simply stops serialising
  every write in the whole application through one connection.
- **Explicit row locks** where correctness used to ride on that serialisation.
  Booking capacity, lottery prize stock and invite redemption are all
  check-then-write, and all now take `SELECT ... FOR UPDATE`. These failures
  were silent and only appeared under real simultaneous load.
- **Storage is per owner**: `<PHOTOS_DIR>/u/<userId>/...`, keyed on the account
  id so a username change never moves a file. Deleting an account now removes
  its files too.
- **Four test suites** — `test:concurrency`, `test:isolation`, `test:quota`,
  `test:http` — each verified to fail when the protection it covers is removed.

### Breaking

- Login moved from `/admin/login` to `/login`. The per-user admin area moved
  from `/admin` to `/dashboard`; `/admin` is now platform-only.
- Public pages moved from `/gallery`, `/booking` to `/u/<username>/...`.
  Token-addressed links (`/book/<token>`, `/draw/<token>`,
  `/my-booking/<token>`) are unchanged, so links already shared keep working.
- `DATABASE_URL` is now set by compose and `POSTGRES_PASSWORD` must be set in
  `.env` before the first start. `data/db` is replaced by `data/pg`; back up
  that folder instead (see the README — a live file copy of it may not restore).

## v1.0.0

First tagged release of the single-photographer site this was forked from.
Everything below has been running end-to-end and is considered stable enough for
real use on a self-hosted NAS.

### Features

- **Photo gallery** grouped by event/album: bulk upload, reordering,
  per-language captions, cover selection, publish/unpublish. Thumbnails are
  pre-generated at upload time; all EXIF (including GPS) is stripped from
  every displayed image, with an option to also scrub stored originals.
  Credited people's social links are remembered across photos and offered as
  autofill.
- **Booking system** with configurable time slots, an unguessable shareable
  link per event (no visitor account needed), transactional capacity checks,
  and a visitor-facing manage/cancel link. Optional per-event prize-draw
  ("lottery") tool built around bookings, with a "check your booking" lookup
  flow.
- **Contact us**: an admin-configurable button in the site header and
  footer that opens a card with a title, link, and/or QR code (e.g. a chat
  app add-friend code).
- **Resource monitor**: an admin tab showing real disk usage — photos (per
  event), site images, and the database — read straight off disk.
- **Fully brandable, no code changes needed**: site title, homepage text,
  background color/image, logo, and photo-credit vocabulary are all edited
  from Admin → Settings (organized by where each setting shows up on the
  site: Header, Background, Homepage, Contact us, Booking, Lottery, Credits)
  and take effect immediately.
- **First-run setup wizard** to pick which optional features (booking,
  lottery, credit-profile management) are enabled before the site goes
  live, plus feature toggles reachable any time afterward.
- **Bilingual everywhere**: locale-prefixed URLs (`/zh/...`, `/en/...`),
  language switcher, and per-language content fields with fallback to the
  other language when one is empty.
- **Single admin account**, seeded from environment variables on first
  login, with session-cookie auth, bcrypt-hashed password, and rate-limited
  login attempts.
- Modest resource use: one container, SQLite, no runtime image optimizer —
  built to run comfortably on a NAS.

### Deployment

- Docker image + `docker-compose.yml` tuned for Synology Container Manager,
  with automatic database migrations on container start.
- New in this release: **[docs/DEPLOY_SYNOLOGY.md](docs/DEPLOY_SYNOLOGY.md)**
  — a detailed, start-to-finish deployment tutorial covering everything from
  first upload to connecting a custom domain with HTTPS (DDNS, DNS records,
  router port forwarding, Let's Encrypt, and DSM's reverse proxy).
