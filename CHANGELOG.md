# Changelog

## Unreleased

### Security and reliability

- Photos gain nullable subject columns filled by server-side detection using
  libvips's attention strategy on the existing 1280 px rendition, with no new
  dependency or external service. New uploads are detected inside the
  compression job; existing photos are backfilled once after boot, one at a
  time through the image-processing slot, newest first, with a
  `SUBJECT_DETECTION_SWEEP` kill switch.
- WebP uploads now record their shooting data. exifr returned nothing at all
  for WebP, so the camera, lens, ISO, aperture, focal length and capture time
  of every WebP photo were silently discarded.
- Photo EXIF is now parsed with exif-reader from the payload sharp already
  returns, replacing exifr. exifr was last published in 2022, and it leaked the
  file handle it opened when given a path, which Node 26 treats as a fatal
  error during garbage collection; its path reader also fails outright there,
  so shooting data would have gone missing on every upload while the server
  crashed when the handle was collected. Reusing sharp's payload also removes a
  second read of the file for JPEG, PNG and WebP. TIFF carries no such payload,
  so it is still read from disk, bounded, and parsed directly.
- The Docker image and CI now run on Node.js 26 instead of Node.js 22. Node 22
  entered maintenance in October 2025 and reaches end of life in April 2027;
  Node 26 becomes Active LTS in October 2026 and is supported until April 2029.
  The Alpine base is unchanged, so the runtime image gains no new kernel or
  libc requirement on Synology hardware. Node 26 also bundles npm 11, so the
  explicit `npm install -g npm@11` step the older images needed is gone from
  both build stages and from CI.
- Photo uploads larger than 10 MB no longer fail with a generic "Upload
  failed" error. API routes are excluded from the middleware matcher again, so
  Next.js no longer clones the multipart body for middleware and silently
  truncates it at its 10 MB `middlewareClientMaxBodySize` default before it
  reaches the upload handler. Uploads stream to the bounded temporary file up
  to `UPLOAD_MAX_MB` as documented.
- Public lottery authorization now uses a separate encrypted visitor session;
  entrant identities, contact details, and recovery tokens are no longer sent
  to other visitors. Recovery requires the matching token and submitted contact
  identity, with rate limiting and fresh availability checks before every spin.
- Image uploads stream to contained temporary files with request-size,
  decoded-pixel, page, and global processing-concurrency limits. TIFF remains
  supported without buffering an entire upload in application memory.
- Account and photo deletion now use contained quarantine paths and
  owner-scoped conditional deletion, preventing traversal and double quota
  release. Protected images use private, no-store caching.
- Registration notices can require versioned affirmative consent, with the
  accepted content hash, locale, and time recorded on the redeemed invitation.

### User experience

- Sharing posters can be exported at 8192 px on the longest edge, twice the
  previous maximum. The area ceiling that went with it rose from 12 megapixels
  to the square case at that edge, which also fixes the old 4096 option: at
  1:1, 4:5 and 4:3 it was quietly reduced to about 3.5K, so it delivered less
  than it named. Posters saved earlier keep their stored size and now render
  it in full. The largest size is built entirely in the browser and is
  flagged as such next to the setting.
- Sharing posters now find the subject of each photograph and compose around
  it. New photos follow the detected subject by default, so a portrait is no
  longer cropped through the head, and the layout gives such photos frames
  shaped to keep the subject whole. Any photo can be switched to a manual
  anchor that survives ratio and layout changes; dragging the preview now
  moves the content 1:1 with the pointer. Posters saved earlier keep their
  crops exactly until a photo's mode is changed.
- Sharing posters gained an adjustable gap between the photographs and the
  credits, down to zero. It was previously fixed at the outer margin plus a
  padding derived from the font size and could not be reduced on its own.
  Posters saved earlier keep their exact spacing until the slider is moved.
- Sharing posters can use a liquid-glass background instead of a solid colour:
  a soft gradient built from the photographs' colours rather than their
  pixels. Colours are weighted toward the most vivid in each photograph, flow
  out from each frame's sides into the surrounding space and blend across the
  gaps, and the background colour frosts the result, with a faint sheen, soft
  shadows under the frames and a fine grain that keeps large exports from
  banding. An earlier version stretched each photograph's edge pixels
  outward, which smeared recognisable shapes such as a costume into bars
  across the margins. Softness and tint are adjustable; solid colour remains
  the default.
- New accounts get a step-by-step on-screen tutorial on their first visit to
  the dashboard, after the setup wizard: nine coach marks lead from the
  Overview to the Events list, through naming an event, picking its days and
  creating it, into the gallery and the photo upload wizard. Each step
  highlights the real control and either advances with Next or waits for the
  user to press it. The steps that ask for a title and for shoot days keep
  Next disabled until the page has them, so the tutorial cannot lead anyone to
  a Create button that would only reject them. It can be skipped at any point
  and replayed from the Overview page; completion is stored on the account so
  it does not return on another device. Accounts that already existed are
  treated as done.
- Equipment status can be changed straight from the inventory list. The three
  everyday states are now a control on each card instead of a read-only badge,
  so moving an item between in-inventory, signed-out and broken no longer means
  opening the editor. Status notes, maintenance and other are unchanged and
  still live in the editor.
- The public header no longer mixes control heights. The language switcher
  stood taller than everything beside it; every control is now the same height
  and a full touch target. The header and mobile menu also link back to the
  platform root, which an owner's site previously had no way to reach.
- Clicking the logo or site title in the management sidebar opens the
  photographer's public page rather than the dashboard home the navigation
  already pointed at.
- Photo previews show the whole photo, both the cover thumbnails on the gallery
  list and the cards inside a gallery. They were cropped to a fixed box before,
  so a portrait frame lost its edges; a tall photo showed barely a third of
  itself on the gallery cards.
- Pending uploads can be cancelled individually or in bulk, and destructive
  removal confirms the affected files and storage. Settings warn before dirty
  navigation, while language changes retain the active section and URL suffix.
- Setup credential changes now require the current password and consistently
  enforce lowercase, reserved-name, and account-eligibility rules.

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
