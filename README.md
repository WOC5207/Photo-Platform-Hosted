# Photo Platform

A self-hosted, bilingual (简体中文 / English) photography **platform**: many
photographers, each with their own site, gallery and booking system, all running
from one Synology NAS (or any Docker host).

Forked from a single-photographer portfolio. The deployment story is inverted:
instead of every photographer running their own NAS, one person runs this and
invites the rest — they get a site without ever touching Docker.

> **Deploying to a Synology NAS?** The
> [step-by-step guide below](#deploying-on-a-synology-nas-dsm-72-container-manager)
> covers the basics; **[docs/DEPLOY_SYNOLOGY.md](docs/DEPLOY_SYNOLOGY.md)**
> goes further, including connecting a custom domain with HTTPS end to end.

## How it is organised

| URL | What it is |
|---|---|
| `/` | Directory of every photographer hosted here |
| `/u/<username>` | One photographer's public site — home, gallery, albums, booking |
| `/dashboard` | "My site" — every account manages their own content here |
| `/admin` | Platform administration: accounts, invites, storage plans and platform health. Admin only. |
| `/book/<token>` | A shareable booking link. The token identifies the event *and* its owner, so these carry no username and keep working forever. |

The admin's own photography lives at `/u/<their-username>` like everyone else's;
there is no privileged site.

## Features

- **Invite-only registration.** There is no public signup form. The admin issues
  a link from **Platform admin → Invites**; only someone holding one can create an
  account. Each invite works exactly once.
- **Per-account storage plans.** The admin assigns the default tier, a named
  tier or a custom limit under **Platform admin → Accounts → Storage plan**.
  Named tiers live under **Storage plans**, while **Platform health** is reserved
  for disk and database monitoring. Photographers see their own usage under
  **My storage**; uploads are refused once the limit is reached, and deleting
  frees it again.
- **Photo gallery** grouped by event/album: bulk upload, reordering,
  per-language captions, cover selection, publish/unpublish. Thumbnails are
  pre-generated at upload time with `sharp`; **all EXIF (including GPS) is
  stripped** from every displayed image. Each picker selection can keep the
  exact original or use a 6000px Archive / 4096px Balanced optimized master,
  with exact source, compressed and final-storage sizes shown before Create.
  Selecting files starts a private pending upload immediately, so the picker
  can be opened repeatedly to build one batch. The queue shows total byte
  progress and an owner-only thumbnail for every photo, and expands with the
  page instead of using a nested scrollbar. **Create** removes the unselected
  master and applies the shared credits to every ready photo. Credited people's
  social links are remembered across photos, per account.
- **Booking system**: bookable events with configurable time slots (length,
  count, capacity). Each gets an unguessable shareable link — no visitor account
  needed. Double-booking is prevented with row-locked capacity checks. Visitors
  get a private link to view/cancel. New events start as closed drafts and need
  at least one time slot plus one visitor contact method before they can open
  publicly. Optional per-event prize draw. Turning Booking or Lottery off
  publicly does not hide existing management data from its owner.
- **Bilingual everywhere**: locale-prefixed URLs (`/zh/...`, `/en/...`),
  language switcher, per-language content fields with fallback.
- **Every account brands its own site**, no code changes: title, homepage
  headline/subtitle, background, logo, and the vocabulary used for photo credits
  (e.g. "Credit"/"Subject" vs "Cosplayer"/"Character") are all per account, from
  **My site → Site settings**.
- **Role-aware management shell.** Personal-site controls and platform-wide
  administration remain separate, with a persistent desktop sidebar and a
  compact navigation drawer on mobile and tablet layouts.
- **Accounts are isolated.** Content is owned; one photographer cannot see or
  touch another's albums, bookings, originals or unpublished work. Suspending an
  account takes its public site down and ends its session on the next request.

## Stack

Next.js 15 (App Router, TypeScript) · **PostgreSQL** + Prisma · sharp ·
Tailwind CSS 4 · next-intl · iron-session

Two containers: the app, and Postgres. Everything persistent lives in `./data`.

---

## Deploying on a Synology NAS (DSM 7.2+, Container Manager)

Tested target: DS920+ (x86-64). Everything below happens in DSM. The same
`docker-compose.yml` works on any Docker host — adjust paths accordingly.

> **Bandwidth, not disk, is the real limit.** Every visitor to every
> photographer's gallery pulls full-size images through your home upload link.
> That — not the database — is what will bite first if the platform gets busy.
> Invite-only registration is what keeps it predictable.

### 1. Copy the project to the NAS

1. In **File Station**, create a folder for the app, e.g.
   `docker/photo-platform` (i.e. `/volume1/docker/photo-platform`).
2. Upload the entire project folder there (everything in this repo —
   `node_modules`, `.next` and `data` are **not** needed; they are ignored by
   the Docker build).

### 2. Create your `.env`

1. Copy `.env.example` to `.env` in the same folder.
2. Edit it (File Station → right-click → *Open with Text Editor*):

| Variable | What to set |
|---|---|
| `POSTGRES_PASSWORD` | A long random password for the database container. **Set this before the first start** — see the warning below. |
| `PHOTOS_DIR` | Leave as-is (`/data/photos`) |
| `ADMIN_USERNAME` | Your admin login name |
| `ADMIN_PASSWORD` | A long, unique password (stored only as a hash) |
| `SESSION_SECRET` | 32+ random characters — see below |
| `APP_BASE_URL` | Your public HTTPS address, e.g. `https://photos.example.com` (used to build shareable booking and invite links) |
| `STRIP_ORIGINAL_EXIF` | `false` allows photographers to choose an exact Original; `true` hides that option so every new stored master is optimized with EXIF/GPS removed |
| `UPLOAD_MAX_MB` | Max size per uploaded photo (default 100) |

Compression is server-side and sequential for predictable NAS memory use.
Balanced (4096px) is the default; Archive (6000px) uses more CPU and storage.
While a photo is pending, its exact source, one comparison candidate and the
three gallery renditions all count toward quota until **Create** removes the
unselected master.

`DATABASE_URL` is **not** in `.env` — `docker-compose.yml` sets it for you, to
point at the database container.

To generate good secrets, SSH into the NAS (or use any terminal) and run
`openssl rand -base64 32` — once for `SESSION_SECRET`, once for
`POSTGRES_PASSWORD`.

> **`POSTGRES_PASSWORD` is only read the first time the database starts.**
> Postgres bakes it in when it initialises `./data/pg`. Changing it in `.env`
> afterwards silently does nothing — the old password still works and the new
> one does not. To genuinely change it, either use `ALTER USER` inside the
> database container, or delete `./data/pg` and start over (which erases
> everything).

> The admin credentials are written into the database on the **first login
> attempt**. After that, changing `ADMIN_PASSWORD` in `.env` has no effect —
> the DB copy wins. The first-run wizard prompts you to replace them anyway.

### 3. Build and start with Container Manager

1. Open **Container Manager** → **Project** → **Create**.
2. Project name: `photo-platform`. Path: the folder from step 1
   (`/volume1/docker/photo-platform`). It will detect `docker-compose.yml`.
3. Click through and **Build**. The first build downloads images and compiles
   the app — expect **5–15 minutes** on a DS920+. Later rebuilds are faster.
4. Two containers start: `photo-platform-db` (Postgres) and `photo-platform`
   (the app, on **port 3000**). The app waits for the database to report
   healthy, then applies migrations automatically before serving.

Your persistent data is two folders next to the compose file:

- `data/photos` — selected masters, pending comparisons and generated web sizes, per account
- `data/pg` — the database

Both are created on first start. The containers themselves are disposable.

> **Never put a file in `data/pg` by hand** (not even `.gitkeep`). Postgres
> refuses to initialise into a directory that is not empty, and the error it
> gives does not point at the cause.

**If the build fails or the NAS struggles** (low RAM): build the image on a PC
with Docker instead:

```
docker build --platform linux/amd64 -t photo-platform:latest .
docker save photo-platform:latest -o photo-platform.tar
```

Upload `photo-platform.tar` via Container Manager → **Image** → **Add → From
file**, then in `docker-compose.yml` replace `build: .` with
`image: photo-platform:latest` and create the project as above. (Only the `app`
service needs this; Postgres pulls its own official image.)

### 4. First run

1. Visit `http://<NAS-IP>:3000/en/login` (or `/zh/login`).
2. Log in with `ADMIN_USERNAME` / `ADMIN_PASSWORD` — this first login creates
   your account.
3. You land directly in the dashboard. Open the profile menu and choose
   **Account → Profile & security** to replace the placeholder password, then
   configure branding and public features under **My site → Site settings**.
   Invited photographers still complete the guided setup wizard.
4. Create an album, upload photos, publish. Your site is at
   `/u/<your-username>`, and it now appears in the directory at `/`.

### 5. Inviting photographers

1. **Platform admin → Invites → Create invite**. Add a note so you remember who
   it was for.
2. Copy the link and send it to them. It works once.
3. They pick their own username (their site becomes `/u/<username>`), display
   name and password, then land in their own setup wizard.
4. Open **Platform admin → Accounts**, choose the account, then use its
   **Storage plan** card to assign the default tier, a named tier or a custom
   limit. Named tiers are managed under **Storage plans**. Lowering a limit below
   current usage does not delete anything — the account simply cannot upload
   more until it frees space.

**Platform admin → Accounts** lists everyone. *Suspend* takes an account's public site
down — its pages and its photos, including image links already shared — and ends
its session immediately. It is reversible: nothing is deleted, so setting the
account back to active brings the site back as it was. *Delete* removes the
account, its content and its files permanently. You cannot suspend or delete
yourself.

### 6. HTTPS via DSM reverse proxy

DSM handles the domain, certificate and HTTPS; the app just needs to know its
public URL (`APP_BASE_URL`).

1. **Control Panel → Login Portal → Advanced → Reverse Proxy → Create**:
   - Source: HTTPS, your hostname (e.g. `photos.example.com`), port 443
   - Destination: HTTP, `localhost`, port 3000
2. Make sure the hostname has a valid certificate
   (**Control Panel → Security → Certificate**).
3. Set `APP_BASE_URL` in `.env` to `https://photos.example.com`, then in
   Container Manager select the project → **Action → Build/Recreate** so the
   new value is picked up.

Only port 3000 is published, and only the app publishes it — the database is
reachable only from the app, over the compose network. **Never forward port
3000 from your router**; DSM's reverse proxy is the front door.

Don't have a domain pointed at the NAS yet, or unsure how DDNS, port
forwarding and Let's Encrypt fit together? See
**[docs/DEPLOY_SYNOLOGY.md](docs/DEPLOY_SYNOLOGY.md)** for the full
walkthrough.

### 7. Backups (do this!)

Everything that matters lives in two folders next to the compose file:

- `data/photos` — every account's selected masters, pending comparisons and generated sizes
- `data/pg` — the database (accounts, albums, captions, bookings, settings)

**Both, or neither.** Photos without the database are unattributed files; the
database without the photos is a site full of broken images.

Use **Hyper Backup** to back both up on a schedule (nightly is plenty).

> Copying `data/pg` while Postgres is running can capture it mid-write, and such
> a copy may not restore. For a backup you can rely on, either stop the project
> first, or dump the database instead:
>
> ```
> docker compose exec db pg_dump -U photo photo > backup.sql
> ```
>
> A dump is consistent by design and safe to take while the site is live.

Restoring = putting both folders back and starting the project (or restoring
`data/photos` and replaying the dump into a fresh database).

### 8. Updating the app

Replace the project files (keep `.env` and `data/`!), then Container Manager →
project → **Action → Build/Recreate**. Database migrations run automatically at
container startup.

---

## Local development

Requirements: Node.js 22+, and Docker for the database.

```
npm install

# A disposable Postgres for development:
docker run -d --name photo-dev-pg -p 5432:5432 \
  -e POSTGRES_USER=photo -e POSTGRES_PASSWORD=photo -e POSTGRES_DB=photo \
  postgres:17-alpine

# Point .env at it (see .env.example), then:
npx prisma migrate deploy
npm run dev              # http://localhost:3000
```

### Tests

Database-focused scripts and mutation-enabled end-to-end tests need disposable
data. **Never set `E2E_ALLOW_MUTATIONS=1` against a production database.**

| Command | What it proves |
|---|---|
| `npm run test:concurrency` | Booking capacity and lottery prize stock hold under simultaneous requests |
| `npm run test:isolation` | The ownership helpers refuse another account's ids; invites redeem once; usernames are reserved |
| `npm run test:quota` | The storage cap holds under concurrent uploads; reconcile recovers drift |
| `npm run test:http` | Cross-tenant pen pass plus pending-photo privacy over real HTTP (needs `npm run dev` running) |
| `npm run test:e2e` | Role-aware navigation, responsive layouts, settings, pending photo uploads and booking workflows, English/Chinese themes, and axe accessibility checks |
| `npm run test:e2e:ui` | The same Playwright suite in its interactive runner |

> These suites are worth their weight only because each has been checked to
> **fail** when the protection it covers is removed. If you change one, verify
> it still fails against a deliberately broken implementation — a test that
> cannot fail proves nothing. The reasons each is shaped the way it is are in
> the file headers; `test-concurrency.ts` in particular explains why a "fire N
> concurrent requests" test can pass against code with no lock at all.

#### End-to-end tests

Playwright checks the management UI at 320, 375, 768 and 1280 pixels. It uses
the installed Chrome channel by default; set `PLAYWRIGHT_CHANNEL` to override
it. `PLAYWRIGHT_BASE_URL` defaults to `http://127.0.0.1:3000`.

For the full workflow suite, use the isolated Compose stack on port 3001 and
provide `E2E_ADMIN_USERNAME`, `E2E_ADMIN_PASSWORD` and `E2E_SESSION_SECRET`
with values matching its `.env`. Set `E2E_ALLOW_MUTATIONS=1` only for this
disposable stack. Optional `E2E_USER_USERNAME` and `E2E_USER_PASSWORD` values
exercise the regular-account role directly; otherwise the suite can derive a
read-only regular-user session when a second account exists.

```sh
docker compose -p photo-platform-e2e -f docker-compose.e2e.yml up -d --build

PLAYWRIGHT_BASE_URL=http://127.0.0.1:3001 \
E2E_ADMIN_USERNAME=admin \
E2E_ADMIN_PASSWORD='replace-with-the-disposable-admin-password' \
E2E_SESSION_SECRET='replace-with-the-disposable-session-secret' \
E2E_ALLOW_MUTATIONS=1 \
npm run test:e2e

docker compose -p photo-platform-e2e -f docker-compose.e2e.yml down -v
```

The final `down -v` removes the isolated database and photo volumes.

### Migrations

**Migrations are additive.** Add one with `npx prisma migrate dev --name
what_changed`; never edit or regenerate one that has been applied. See the note
at the top of [prisma/schema.prisma](prisma/schema.prisma).

## Adding email confirmations later

The booking flow already calls `notifyBookingCreated()` /
`notifyBookingCancelled()` in [src/lib/notify.ts](src/lib/notify.ts) with
everything an email needs (visitor contact, event, slot times, and the
visitor's manage/cancel link). To enable email: `npm install nodemailer`,
implement those two functions with SMTP credentials from new `SMTP_*` env
vars, and rebuild. Nothing else has to change.

## Notes & limits

- Uploads: JPEG, PNG, WebP (HEIC is not supported — export/convert first).
- Pending uploads are fully processed, private and recoverable after a page
  reload. The exact source and one compressed candidate both count toward the
  photographer's storage temporarily; **Create** keeps the chosen master,
  removes the other copy and releases that space. A per-photo preset can be
  changed before Create without uploading the source again.
- Unpublished albums are fully hidden (404) from everyone but their owner, and
  their images are blocked too. Original files are only ever served to the
  photo's owner.
- The storage cap is enforced again after compression, once the exact source,
  candidate and rendition sizes are known. If the complete pending comparison
  would exceed the allowance, it is cleaned up and the upload is refused.
- Slot times are stored and shown exactly as typed (no timezone conversion),
  which is the sane behaviour when photographer and clients are in the same
  city.
- Rate limits: 10 login attempts / 15 min, 10 registrations / 15 min, 8
  bookings / hour per IP. These are in-memory, which assumes a single app
  container — the last such assumption in the codebase, and the first thing to
  revisit if the app is ever run as more than one replica.

This project is licensed under the terms in [LICENSE](LICENSE).
