# WeChat Mini Program operations

This document covers the server-side release boundary for the visitor Mini
Program. The Mini Program is a separate GPL-3.0 repository. This repository
remains the only data source and the canonical owner of the
`/api/v1/miniapp` contract.

## Safety boundary

The API is fail-closed at two independent levels:

1. `MINIAPP_API_ENABLED` must be exactly `true`.
2. A photographer's `SiteSettings.miniappEnabled` must have been enabled by a
   platform administrator after the photographer's public content was reviewed.

Turning either switch off hides the applicable API surface without deleting
data. Existing Web routes, dashboard sessions, booking cancel tokens, the
PostgreSQL database, and the NAS photo tree do not depend on the Mini Program
tables.

Never expose `WECHAT_MINIAPP_APP_SECRET`, WeChat `session_key`, OpenID, bearer
tokens, or Web booking cancel tokens in URLs, analytics, request logs, browser
logs, screenshots, or client-side error reports.

## Runtime configuration

Add the following server-only values to `.env`:

```dotenv
# Keep false until Gate 0 and the vertical-slice checks are complete.
MINIAPP_API_ENABLED="false"
WECHAT_MINIAPP_APP_ID=""
WECHAT_MINIAPP_APP_SECRET=""

# Public HTTPS origin used to produce absolute image URLs.
ASSET_BASE_URL="https://photos.example.com"

# Optional; defaults to 7 and is bounded by the server.
MINIAPP_SESSION_TTL_DAYS="7"
```

The App ID and secret are read lazily by the authentication endpoint. Leaving
them unset while the API is disabled does not prevent the Web application from
starting. The secret belongs only on the server.

Apply the additive migration before enabling the API:

```bash
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
```

Back up PostgreSQL and the NAS photo directory before every production
migration. The Mini Program migration only adds nullable relations, new tables,
indexes, and a tenant flag whose default is `false`.

## Gate 0: stop/go checklist

Do not continue to public release until every item is evidenced:

- The intended WeChat account subject has an App ID.
- WeChat support has confirmed in writing that the real service — a public,
  multi-photographer gallery with booking and prize draws — fits an available
  service category for that subject.
- If an individual subject is not eligible, an eligible mainland organisation
  is used. Do not rename, wrap, or select an inaccurate category.
- Any filing required for the Mini Program and public domain is complete.
- `request` and `downloadFile` legal domains use the production hostname,
  HTTPS on port 443, a complete trusted certificate chain, and no unsupported
  redirect.
- The NAS can make outbound HTTPS requests to the WeChat API.
- A real-device vertical slice succeeds:
  `wx.login -> one photographer -> one album -> share -> cold start`.

If category, filing, DNS, certificate, inbound reachability, or outbound WeChat
API access fails, leave `MINIAPP_API_ENABLED=false` and stop the release.

## Enabling one photographer

Before an administrator enables a photographer:

1. Confirm that the account is active and its public site is published.
2. Backfill the existing photo moderation workflow or record a manual review
   for every photo that could be returned.
3. Resolve or hold unsafe content. Pending, failed, rejected, unpublished, and
   moderation-held photos remain private.
4. Enable **WeChat Mini Program** on the account detail page.
5. Exercise its directory, album, photo, search, booking and lottery responses
   with a non-admin client.

The first release does not accept public photo uploads from the Mini Program.

## Privacy and account deletion

The client must show the privacy notice when an identity is first needed. The
notice covers OpenID, booking contact details, behaviour/security logs, content
reports, their purposes, retention, withdrawal, and deletion.

`DELETE /api/v1/miniapp/me` requires explicit client-side confirmation and then:

- cancels future bookings associated with the identity;
- removes personal/contact fields from associated bookings and lottery entries;
- revokes every Mini Program session;
- deletes the OpenID mapping.

The operation does not infer or delete a Web account. A WeChat identity is never
linked to a Web user from nickname, avatar, email, phone number, or any other
similarity heuristic.

## Performance release gate

Measure from the target visitor network against the production-like NAS:

- API p95 no greater than 1.5 seconds;
- first album-screen thumbnails no greater than 3 seconds;
- continuous browsing of 500 photos without a crash.

Record device model, OS, WeChat version, network, album, sample size, p50/p95,
error rate, and memory observations. If any gate fails, keep the public switch
off and create a separate CDN/object-storage or mainland-BFF infrastructure
phase. Do not introduce silent dual writes or data synchronisation.

## Rollback and incident response

For a platform-wide incident, set `MINIAPP_API_ENABLED=false` and restart the
application. For one photographer, clear that account's
`SiteSettings.miniappEnabled`. Both paths fail closed and preserve data for
investigation.

Rotate the WeChat AppSecret in the WeChat console and on the server if it may
have leaked. Revoke Mini Program sessions if bearer tokens may have leaked.
Never paste secrets or raw tokens into an issue or support transcript.

When horizontal application replicas are introduced, replace the current
process-local write limiter with a shared Redis-backed limiter before enabling
traffic on more than one replica.
