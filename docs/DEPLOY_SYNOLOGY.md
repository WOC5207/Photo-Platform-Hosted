# Deploying Photo Platform on a Synology NAS

A complete, start-to-finish walkthrough: getting the app running in Container
Manager, and — the part that trips people up most — connecting a real domain
name to it with HTTPS. If you just want the short version, see the
[README](../README.md#deploying-on-a-synology-nas-dsm-72-container-manager);
this document goes deeper on every step, especially domains.

**Tested target**: DS920+ (x86-64), DSM 7.2. Anything DSM 7.2+ that can run
Container Manager (formerly Docker) should work the same way. ARM-based
models (e.g. DS220j) are not supported — Node.js/sharp need x86-64 or a
compatible ARM64 build, and this hasn't been tested on one.

---

## Contents

1. [Prerequisites](#1-prerequisites)
2. [Get the code onto the NAS](#2-get-the-code-onto-the-nas)
3. [Configure the environment](#3-configure-the-environment)
4. [Build and run in Container Manager](#4-build-and-run-in-container-manager)
5. [First run](#5-first-run)
6. [Connect a domain](#6-connect-a-domain)
7. [Enable email notifications (optional)](#7-enable-email-notifications-optional)
8. [Backups](#8-backups)
9. [Updating the app](#9-updating-the-app)
10. [Troubleshooting](#10-troubleshooting)
11. [Security checklist](#11-security-checklist)

---

## 1. Prerequisites

- A Synology NAS running **DSM 7.2 or later**, with the **Container Manager**
  package installed (Package Center → search "Container Manager" → Install).
- At least ~2 GB of free RAM during the first build (the build step compiles
  the Next.js app). 4 GB+ total NAS RAM is comfortable; on smaller models see
  the "build on a PC instead" note in [step 4](#4-build-and-run-in-container-manager).
- Admin access to DSM (Control Panel).
- Optional but recommended for the domain section: a domain name you own
  (from any registrar — Namecheap, Cloudflare, GoDaddy, etc.) or a free
  Synology QuickConnect/DDNS hostname. Both are covered below.
- Admin access to your home/office router, **if** your NAS is behind one and
  you want a custom domain (needed for port forwarding).

---

## 2. Get the code onto the NAS

Pick one:

**Option A — File Station (no SSH needed)**

1. Download this repository as a ZIP (GitHub → **Code** → **Download ZIP**)
   and unzip it on your computer.
2. In DSM **File Station**, create a folder, e.g. `docker/photo-platform`
   (i.e. `/volume1/docker/photo-platform`).
3. Upload the project folder's contents there. You do **not** need to upload
   `node_modules`, `.next`, or `data` if present locally — they're not part
   of the repo and are ignored by the Docker build either way.

**Option B — git clone over SSH** (if you're comfortable with a terminal)

1. Enable SSH: **Control Panel → Terminal & SNMP → Enable SSH service**.
2. SSH into the NAS: `ssh your-user@<nas-ip> -p 22`.
3. `cd /volume1/docker && git clone https://github.com/<your-fork-or-repo>.git photo-platform`

Either way you should end up with a folder containing `Dockerfile`,
`docker-compose.yml`, `package.json`, `prisma/`, `src/`, etc.

---

## 3. Configure the environment

1. Copy `.env.example` to `.env` in that same folder (File Station:
   right-click `.env.example` → Copy, then rename the copy to `.env`; or over
   SSH: `cp .env.example .env`).
2. Edit `.env` (File Station → right-click `.env` → **Open with Text
   Editor**, or `vi .env` over SSH) and fill in every value:

| Variable | What to set |
|---|---|
| `POSTGRES_PASSWORD` | A long random password for the database container. **Set this before the first start** — Postgres only reads it when it initialises `data/pg`, and changing it later silently does nothing. |
| `PHOTOS_DIR` | Leave as-is: `/data/photos` |
| `ADMIN_USERNAME` | Your admin login name |
| `ADMIN_PASSWORD` | A long, unique password — stored only as a bcrypt hash, never in plaintext |
| `SESSION_SECRET` | 32+ random characters — see below |
| `APP_BASE_URL` | Your public HTTPS address, e.g. `https://photos.example.com`. Used to build shareable booking links, so it must match whatever domain you land on in [step 6](#6-connect-a-domain) |
| `STRIP_ORIGINAL_EXIF` | `false` lets photographers choose a byte-identical Original; `true` hides that option so new stored masters use EXIF-free Archive or Balanced compression (displayed images always have EXIF stripped) |
| `UPLOAD_MAX_MB` | Max size per uploaded photo, default `100` |
| `IMAGE_MAX_PIXELS` | Maximum decoded pixels; keep `100000000` unless the NAS has ample memory |
| `IMAGE_PROCESSING_CONCURRENCY` | Concurrent Sharp jobs; `1` is the recommended Synology value |
| `TRUSTED_PROXY_HOPS` | `1` for DSM's reverse proxy, or `2` when Cloudflare is also proxying traffic |

Uploads stream to a bounded temporary file and stop immediately after the
configured byte limit. Photo compression runs server-side and one file at a time to keep NAS memory
usage predictable. A pending photo temporarily stores the exact source, one
Archive/Balanced comparison and the three gallery sizes; all of them count
toward the account quota until **Create** removes the unselected master. Archive
uses more CPU and disk than Balanced because it retains up to a 6000px long
edge. Balanced (4096px) is the default and is the better choice for most NAS
deployments.

TIFF files can be small on disk but enormous when decoded. `IMAGE_MAX_PIXELS`
is a second safety boundary for that case; files above it are rejected as
invalid rather than being allowed to exhaust NAS memory.

`DATABASE_URL` is **not** in `.env` — `docker-compose.yml` sets it to point at
the database container, which is reachable only from the app.

The `SMTP_*` variables are **optional** and left out here on purpose — email is
off until you set them. To send booking and announcement emails, see
[step 7](#7-enable-email-notifications-optional).

To generate a good `SESSION_SECRET`:

- Over SSH: `openssl rand -base64 32`
- No SSH access: use any password generator for a 32+ character random
  string, or run `openssl rand -base64 32` on your own computer (macOS/Linux
  have it built in; on Windows use Git Bash or WSL).

Generate `POSTGRES_PASSWORD` separately with `openssl rand -hex 32`; the hex
form avoids URL-reserved characters in the generated database connection
string. Keep `ADMIN_PASSWORD` unique and at most 72 UTF-8 bytes.

> **Don't leave `APP_BASE_URL` as `http://localhost:...` or the NAS's bare
> IP.** Booking confirmation links and visitor cancel-links are built from
> this value — if it's wrong, links you share with clients will be broken.
> The production container uses Secure session cookies and binds the app port
> to NAS loopback. Complete the HTTPS domain and reverse proxy in
> [step 6](#6-connect-a-domain) before signing in; plain NAS-IP HTTP is not an
> authentication path.

---

## 4. Build and run in Container Manager

1. Open **Container Manager → Project → Create**.
2. **Project name**: `photo-platform`.
   **Path**: the folder from step 2 (e.g. `/volume1/docker/photo-platform`).
   Container Manager will auto-detect `docker-compose.yml`.
3. Click through the wizard and **Build**. The first build downloads the
   Node.js base images and compiles the app — expect **5–15 minutes** on a
   DS920+. Subsequent rebuilds (after updates) are faster since most layers
   are cached.
4. Two containers start: `photo-platform-db` (Postgres) and `photo-platform`
   (the app). The app listens on **port 3000** inside the container, which
   `docker-compose.yml` maps only to **127.0.0.1:3000** on the NAS for DSM's
   reverse proxy; the database publishes no port at all and is reachable only
   from the app. The app waits
   for the database to report healthy, then applies migrations automatically
   before serving.
5. The `data/photos` and `data/pg` folders (created automatically next to the
   compose file) are your persistent volumes — the containers themselves can
   be destroyed and recreated freely without losing data.

   > **Never put a file in `data/pg` by hand** (not even `.gitkeep`). Postgres
   > refuses to initialise into a non-empty directory, and the error does not
   > point at the cause.

**If the build fails, or the NAS struggles (low RAM, build gets killed):**
build the image on a regular PC with Docker installed instead, then import
it:

```
docker build --platform linux/amd64 -t photo-platform:latest .
docker save photo-platform:latest -o photo-platform.tar
```

Copy `photo-platform.tar` to the NAS, then in Container Manager: **Image →
Add → From file**, select the tar. Then edit `docker-compose.yml` to replace
`build: .` with `image: photo-platform:latest`, and create the project as in
step 1 above (it will use the imported image instead of building).

---

## 5. First run

1. Complete [step 6](#6-connect-a-domain), then visit
   `https://<your-domain>/en/login` (or `/zh/login` for Chinese).
2. Log in with the `ADMIN_USERNAME` / `ADMIN_PASSWORD` you set in `.env` —
   this first successful login is what creates the admin account in the
   database. After that, changing `ADMIN_PASSWORD` in `.env` has no further
   effect (the database copy is what's checked from then on).
3. Open **Account → Profile & security** and replace the placeholder admin
   password. Configure the admin's photography site from **Site settings**.
   Invited photographers still receive the guided first-run setup wizard.
4. Create a gallery event, upload some photos, and publish it. If booking is
   enabled, create a booking event with time slots and try the public
   booking flow end-to-end.

At this point the site works over plain HTTP on your local network. The next
section covers making it reachable — securely — from the internet under your
own domain.

---

## 6. Connect a domain

This is the section people usually get stuck on, so it's split into every
piece separately. The end state: visiting `https://your-domain.com` from
anywhere on the internet shows your site, with a valid padlock, while DSM
itself (and every other NAS service) stays exactly as private as before.

**How it fits together**: your domain's DNS record points at your NAS's
public IP address (directly, or indirectly via a DDNS hostname) → your
router forwards ports 80/443 to the NAS → DSM's reverse proxy takes HTTPS
traffic for that domain and forwards it internally to the app's port 3000 →
DSM also handles getting and renewing the HTTPS certificate. The app
container itself never talks to the internet directly or knows anything
about domains beyond the `APP_BASE_URL` value you give it.

### 6.1 Do you have a static public IP?

Most home/small-business internet connections have a **dynamic** IP (it can
change). Check what your ISP gives you — if you're not sure, assume dynamic.
This decides which of the two paths below you need.

- **Dynamic IP** (most people): you need a DDNS (dynamic DNS) hostname that
  auto-updates when your IP changes. Do [6.2](#62-set-up-ddns-required-for-dynamic-ips) first.
- **Static IP**: you can point your domain straight at it and skip DDNS
  entirely — go to [6.3](#63-point-your-domain-at-the-nas).

### 6.2 Set up DDNS (required for dynamic IPs)

1. **Control Panel → External Access → DDNS → Add**.
2. Easiest option: choose **Synology** as the service, sign in with (or
   create) a free Synology account, and pick a hostname like
   `yourname.synology.me`. DSM keeps this updated automatically whenever your
   public IP changes — no further setup needed.
3. If you'd rather not use a Synology account, other providers (No-IP,
   DynDNS, etc.) work the same way — pick one from the dropdown and follow
   its instructions.
4. Test it: after a minute or two, `yourname.synology.me` should resolve to
   your current public IP. (`nslookup yourname.synology.me` from any
   computer, or just visit it in a browser once port forwarding in
   [6.4](#64-forward-ports-80443-on-your-router) is done.)

If you're happy with a `*.synology.me` address, you can stop here and use it
as your domain in the rest of this guide (skip straight to
[6.4](#64-forward-ports-80443-on-your-router)). If you want your **own**
custom domain (e.g. `photos.yourstudio.com`), continue to 6.3.

### 6.3 Point your domain at the NAS

Log into your domain registrar's DNS management page (or Cloudflare, if you
use it as your DNS provider) and add one record:

- **Static IP**: an **A record** — Name: `photos` (or `@` for the bare
  domain), Type: `A`, Value: your public IP address.
- **Dynamic IP (using DDNS from 6.2)**: a **CNAME record** instead — Name:
  `photos`, Type: `CNAME`, Value: `yourname.synology.me` (your DDNS
  hostname). This way the domain always points at whatever your current IP
  is, via the DDNS hostname, without you touching DNS again.

Either way this gives you something like `photos.yourstudio.com`. DNS
changes can take anywhere from a few minutes to a few hours to propagate —
if it doesn't resolve immediately, wait and try again before assuming
something's wrong.

> If you use Cloudflare's orange-cloud proxy on the record, turn it **off**
> (grey cloud, "DNS only") for the initial setup — DSM's Let's Encrypt
> validation and the reverse proxy work more predictably against the NAS's
> real IP. You can revisit Cloudflare's proxy/CDN features later once
> everything works.

### 6.4 Forward ports 80/443 on your router

DSM needs to receive traffic on ports 80 (for the one-time Let's Encrypt
domain check) and 443 (HTTPS) from the internet.

1. Find your NAS's **local** IP address: **Control Panel → Network → Network
   Interface**.
2. Log into your router's admin page (commonly `192.168.1.1` or
   `192.168.0.1` — check the sticker on the router if unsure) and find **Port
   Forwarding** (sometimes called **Virtual Server** or **NAT**).
3. Add two rules forwarding external ports **80** and **443** to the NAS's
   local IP, same ports (80→80, 443→443). Leave port 3000 out of this — it
   should **not** be exposed directly to the internet; only DSM's reverse
   proxy (443) will be public-facing.
4. Some routers have "hardware NAT" or "SIP ALG" options that occasionally
   interfere with port forwarding — leave them at their defaults unless you
   hit problems, then try toggling them.

**CGNAT check**: if your ISP shows you a public IP in your router's status
page, but that IP doesn't match what `https://whatismyip.com` shows from a
device on that network, you're likely behind **Carrier-Grade NAT (CGNAT)** —
port forwarding won't work because you don't actually have a dedicated
public IP. Contact your ISP about a static/dedicated IP option, or use a
tunnel-based alternative like Cloudflare Tunnel or Tailscale Funnel instead
of direct port forwarding (out of scope for this guide, but both integrate
fine with DSM's reverse proxy as the final hop).

### 6.5 Get an HTTPS certificate

1. **Control Panel → Security → Certificate → Add → Add a new certificate →
   Get a certificate from Let's Encrypt**.
2. Enter your domain name (e.g. `photos.yourstudio.com`) and an email for
   renewal notices. Leave "Subject Alternative Name" empty unless you also
   want `www.` — if so, add `www.photos.yourstudio.com` there too (and a
   matching DNS record).
3. DSM validates domain ownership over port 80 (which is why step 6.4 has to
   be done first) and issues the certificate. This normally takes under a
   minute if DNS and port forwarding are correct.
4. Certificates from Let's Encrypt auto-renew via DSM roughly every 60 days —
   nothing further to do here.

### 6.6 Set up the reverse proxy

This is the piece that maps `https://photos.yourstudio.com` (public, port
443) to the app container (internal, port 3000).

1. **Control Panel → Login Portal → Advanced → Reverse Proxy → Create**.
2. **Source**:
   - Protocol: `HTTPS`
   - Hostname: `photos.yourstudio.com` (your domain from 6.3, or the DDNS
     hostname from 6.2 if you're using that directly)
   - Port: `443`
3. **Destination**:
   - Protocol: `HTTP`
   - Hostname: `localhost`
   - Port: `3000`
4. Leave the custom header / WebSocket options at their defaults — this app
   doesn't need WebSocket passthrough. Keep `TRUSTED_PROXY_HOPS="1"` when DSM
   is the only reverse proxy. If Cloudflare also proxies into DSM, set it to
   `2` so rate limits use the visitor address rather than a spoofed header.
5. Save. Make sure the certificate from 6.5 is assigned to this hostname:
   **Control Panel → Security → Certificate → Settings**, and confirm
   `photos.yourstudio.com` is mapped to the Let's Encrypt certificate (DSM
   usually does this automatically if it's the only certificate for that
   domain).

### 6.7 Point the app at its real address

1. Edit `.env` and set `APP_BASE_URL="https://photos.yourstudio.com"` (your
   actual domain, matching exactly what you configured above — same scheme,
   no trailing slash).
2. In Container Manager, select the `photo-platform` project → **Action →
   Build/Recreate** so the container picks up the new environment variable.
   (This just recreates the container with the new `.env` values — your data
   in `data/photos` and `data/pg` is untouched.)

### 6.8 Test it

From a device **outside** your home network (e.g. mobile data with Wi-Fi
off) visit `https://photos.yourstudio.com`. You should see the site with a
valid padlock. Check a few things:

- The homepage loads and images render.
- **Admin → Settings** saves changes without errors.
- If booking is enabled, create a test booking and confirm the link you'd
  share (visible on the confirmation page) uses `https://photos.yourstudio.com/...`,
  not `localhost` or the bare NAS IP — if it doesn't, double-check
  `APP_BASE_URL` and that you rebuilt the container after changing it.
- The app's port 3000 is loopback-only. Test through the HTTPS domain; use
  Container Manager logs and health status for low-level troubleshooting.

---

## 7. Enable email notifications (optional)

The platform can email people when it matters: a visitor gets a confirmation
when they book and a notice if the booking is cancelled; the photographer gets
an alert on new/cancelled bookings; and platform announcements go out by email
alongside the in-app banner. Every one of these is sent **only when an address
is on file** — visitors add an optional email on the booking form, and accounts
set one under **Account → Profile**.

This is entirely optional. **Leave the `SMTP_*` variables unset and email is off**
— the site behaves exactly as it does without this section, with in-app notices
only. Nothing here is required to run the platform.

### 7.1 You need an SMTP relay, not your own mail server

The app doesn't run a mail server — it hands each message to an **authenticated
SMTP provider** that does the actual delivery. Two practical reasons you can't
skip this:

- Home and most business ISPs **block outbound port 25**, so a NAS can't deliver
  mail directly even if you set one up.
- Mail sent straight from a residential IP is treated as spam by virtually every
  inbox provider.

So pick a provider and relay through it on **port 587 (STARTTLS)** or **465
(implicit TLS)** — neither is blocked. Any transactional email service works
(Resend, Amazon SES, Mailgun, Brevo, Postmark…), as does a Gmail/Google
Workspace account for low volume. Volume here is tiny — a handful of emails per
booking — so a free tier is plenty.

### 7.2 Set the SMTP variables in `.env`

Add these to the same `.env` from [step 3](#3-configure-the-environment). They
are all optional; email turns on only once `SMTP_HOST` and a From address are
present.

| Variable | What to set |
|---|---|
| `SMTP_HOST` | Your provider's SMTP server, e.g. `smtp.resend.com` |
| `SMTP_PORT` | `587` for STARTTLS (default), or `465` for implicit TLS |
| `SMTP_USER` | The SMTP username — often an API-key name or your full email address |
| `SMTP_PASS` | The SMTP password — usually an **API key** or **app password**, not your account login password |
| `SMTP_FROM` | The visible From, e.g. `Pinhaoshe <no-reply@pinhaoshe.ca>`. Defaults to `SMTP_USER` if omitted |
| `SMTP_SECURE` | `"true"` **only** with port 465; leave `"false"` for 587 (STARTTLS is negotiated automatically) |

> **Treat `.env` as a secret.** It now holds an API key/password. Keep its
> permissions tight (over SSH: `chmod 600 .env`); it is already excluded from
> the repo.

**Example — Gmail / Google Workspace** (simplest, ~500 emails/day). Turn on
2-factor auth for the account, then create an **App password** (Google account →
Security → App passwords) and use it as `SMTP_PASS`:

```
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="you@gmail.com"
SMTP_PASS="the-16-char-app-password"
SMTP_FROM="Pinhaoshe <you@gmail.com>"
```

With Gmail the From address must be the Gmail account itself.

**Example — a provider on your own domain** (best deliverability, recommended
once you have a domain). Shown for Resend; SES/Mailgun/Brevo are the same shape
with their own host and credentials:

```
SMTP_HOST="smtp.resend.com"
SMTP_PORT="465"
SMTP_SECURE="true"
SMTP_USER="resend"
SMTP_PASS="your-api-key"
SMTP_FROM="Pinhaoshe <no-reply@pinhaoshe.ca>"
```

> **Deliverability depends on your domain, not the app.** For any own-domain
> setup the provider will ask you to **verify the domain** by adding **SPF and
> DKIM** DNS records (and ideally **DMARC**) at your registrar — the same place
> you set up DNS in [6.3](#63-point-your-domain-at-the-nas). Skip this and mail
> either lands in spam or bounces. The domain in `SMTP_FROM` must match the
> verified domain.

### 7.3 Apply it

In Container Manager, select the `photo-platform` project → **Action →
Build/Recreate**. This matters: `.env` is read by `env_file` **when the
container is created**, so a plain restart won't pick up new SMTP values —
recreating the container will. Your data in `data/photos` and `data/pg` is
untouched.

### 7.4 Test it

1. Sign in, open **Account → Profile**, and set your own email address.
2. Send a platform announcement to "all" (**Admin → Notifications**), or make a
   test booking with an email filled in.
3. Confirm the message arrives (check spam on the first send). Most providers
   also show a per-message delivery log in their dashboard, which is the fastest
   way to tell a rejected send from a mistyped address.

If nothing arrives and the provider log shows no attempt, re-check that the
container was **recreated** after editing `.env` (7.3), and that `SMTP_HOST` and
`SMTP_FROM` are both set — those two are what switch email on.

---

## 8. Backups

Everything that matters lives in two folders next to the compose file:

- `data/photos` — every account's selected stored masters and generated web
  sizes (thumb/med/full), plus temporary pending comparisons and site images
  (logo, background, contact QR),
  under `u/<account-id>/`.
- `data/pg` — the database: accounts, albums, captions, bookings, settings,
  quotas, everything else.

**Back up both, or neither.** They only mean anything together: photos without
the database are a heap of unattributed files, and the database without the
photos is a platform full of broken images.

Use **Hyper Backup** to back both up on a schedule — nightly is plenty for a
small platform.

> **A file copy of `data/pg` taken while Postgres is running may not restore.**
> It is a live database, not a single file, and a copy can catch it mid-write.
> For a backup you can rely on, either stop the Container Manager project
> first, or dump the database instead — a dump is consistent by design and safe
> to take while the site is live:
>
> ```
> docker compose exec db pg_dump -U photo photo > backup.sql
> ```
>
> Keep the dump alongside a `data/photos` backup. Restoring is then: restore
> `data/photos`, start a fresh project, and replay the dump with
> `docker compose exec -T db psql -U photo photo < backup.sql`.

Restoring from folder copies is just putting both back and starting the project
again — but see the warning above about when that is safe to take.

---

## 9. Updating the app

1. Replace the project files with the new version — **keep `.env` and
   `data/`**, don't overwrite or delete either.
   - File Station: upload the new files over the old ones (skip `.env` and
     `data/` in the upload).
   - Git: `git pull` inside the project folder over SSH.
2. In Container Manager: project → **Action → Build/Recreate**.
3. Database migrations run automatically at container startup (see
   `docker-entrypoint.sh`) — no manual migration step needed.

---

## 10. Troubleshooting

**Build fails or hangs on the NAS.** Usually low RAM. Build on a PC instead
and import the image — see the note at the end of [step 4](#4-build-and-run-in-container-manager).

**Container Manager shows the project running, but the HTTPS domain doesn't
load.** Check the container's logs (Container Manager → Container →
select it → **Details → Log**) for a crash on startup — most often a missing
or malformed `.env` value. Confirm `.env` exists in the project folder (not
just `.env.example`) and every variable from [step 3](#3-configure-the-environment)
is filled in.

**`https://your-domain` shows a DSM error page or "502 Bad Gateway".** The
reverse proxy is reachable but can't reach the app. Confirm the container is
actually running, and that the reverse proxy's destination port (6.6) is
`3000` — the same port `docker-compose.yml` publishes.

**`https://your-domain` doesn't load at all (times out).** Almost always
port forwarding ([6.4](#64-forward-ports-80443-on-your-router)) or CGNAT.
Confirm DNS resolves to the right IP first (`nslookup your-domain`), then
confirm ports 80/443 are actually forwarded (many routers have a "port
forwarding test" tool, or use an external site like
[canyouseeme.org](https://canyouseeme.org) to check from outside your
network).

**Certificate request fails.** DSM couldn't validate domain ownership over
port 80 — almost always a port-forwarding or DNS issue. Fix
[6.3](#63-point-your-domain-at-the-nas) and [6.4](#64-forward-ports-80443-on-your-router)
first, then retry the certificate.

**Booking/cancel links point at the wrong address.** `APP_BASE_URL` in
`.env` is wrong, or the container wasn't rebuilt after changing it — see
[6.7](#67-point-the-app-at-its-real-address).

**Forgot the admin password.** `ADMIN_USERNAME`/`ADMIN_PASSWORD` are only
consulted to seed the very first account, so changing them in `.env` does
nothing afterwards. On a platform with real accounts on it, do NOT wipe the
database to get back in — that destroys every photographer's work, not just
yours. Set a new password hash directly instead:

```
# Generate a hash (any machine with Node and this repo):
node -e "console.log(require('bcryptjs').hashSync('your-new-password', 12))"

# Apply it:
docker compose exec db psql -U photo photo   -c "UPDATE \"User\" SET \"passwordHash\" = '<the-hash>' WHERE username = '<you>';"
```

Only on a genuinely fresh install (no accounts you care about) is it simpler to
stop the project, delete `data/pg`, update `.env` and start again.

---

## 11. Security checklist

- Never expose port **3000** directly to the internet (no port-forwarding
  rule for it) — only DSM's reverse proxy on 443 should be public. The
  app has no HTTPS of its own; DSM is what makes this safe.
- Use a long, unique `ADMIN_PASSWORD` and a random 32+ character
  `SESSION_SECRET` — both are described in [step 3](#3-configure-the-environment).
- Keep DSM itself updated (**Control Panel → Update & Restore**) and enable
  2-factor authentication for your DSM login — a compromised DSM account is a
  bigger risk than anything in this app.
- Login attempts to `/login` are rate-limited (10 attempts / 15 min per
  IP) and the admin password is bcrypt-hashed — but this is in-memory rate
  limiting that resets on container restart, not a substitute for a strong
  password.
- Protected originals and unpublished photos use private, no-store responses;
  configure any CDN to respect the origin `Cache-Control` headers.
- Registration notices in **Require agreement** mode record the exact notice
  version and content hash accepted with each redeemed invitation. Editing the
  notice creates a new version automatically.
- Back up regularly (see [step 8](#8-backups)) — it's the only real
  protection against disk failure, accidental deletion, or a botched update.
