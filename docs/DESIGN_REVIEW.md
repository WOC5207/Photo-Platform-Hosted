# UI/UX Pro Max design review

The review applies the installed skill's web guidance to the existing digital
contact-sheet design. Warm paper, graphite, editorial headings, indexed markers,
and the copper accent remain the visual foundation.

## Findings and changes

| Finding | Implemented change |
| --- | --- |
| Empty booking and album screens provided little direction | Shared first-use panel with a clear action and three numbered workflow steps, in English and Chinese |
| Faint metadata had insufficient contrast | Adjusted platform text tokens for both themes; dedicated visible field boundaries |
| Focus styling varied across individual controls | Opaque global keyboard outline, scroll clearance, and a translated skip link to each main landmark |
| Narrow language targets; settings hidden behind account menu | Segmented 44px language links, SVG theme control, persistent desktop utilities and public-site link |
| Theme controls could display stale state after switching between mobile and desktop | Synchronize mounted controls with the effective document theme |
| Mobile drawer restored focus while its trigger was still inert | Restore focus after the drawer closes and the header becomes interactive |
| Inconsistent form surfaces and mobile text size | Reuse shared inset field styling for booking and album forms; 16px mobile input text |
| Long event titles and tags could truncate or overflow | Wrap titles, metadata and status collections; expand selection targets |
| Public header had too many controls for intermediate widths | Use the compact menu below 1280px |
| Dialog content could exceed the viewport | Bound panel height to the dynamic viewport and allow vertical scrolling |
| Directory filtering had no recovery action | Announced result count, clear-search action, and deferred below-fold thumbnails |
| Reduced-motion rules shortened transitions but retained hover displacement | Suppress hover/press displacement when reduced motion is requested |
| Public sidebar headings skipped a level | Use level-two headings; hide the decorative search icon from screen readers |

## Verification scope

TypeScript and the production Docker build validate the implementation. Browser
review covers English/Chinese booking and gallery first-use screens, the booking
form, public homepage/navigation, and directory, across desktop and narrow
viewports and both themes. Keyboard checks cover skip navigation and drawer
dismissal/focus restoration. Color-pair calculations check the changed platform
metadata and field-boundary tokens.

This is a shared-system improvement and representative-page review, not a claim
of exhaustive accessibility certification. The fresh local database has no
published photographs or booking records, so populated content, every custom
photographer palette, and every dialog workflow are not visually certified.

## DS920 performance and full-site follow-up

The September 2026 review keeps the contact-sheet direction and changes the
information architecture rather than restyling it. Booking management now has
Schedule, Overview and Advanced routes; the checklist leads with scanning and
progress; secondary item-adding controls collapse on mobile; and Settings only
shows its floating action surface while a save is relevant.

Shared disclosure, action-bar, filter, pagination and equipment-status
primitives own these patterns. Small accent metadata uses a separately derived
contrast-safe token, and inline operational actions retain a 44px phone target.

Performance work removes the NAS compilation requirement, trims the migration
runtime, bounds public-media caching to a 30-second stale window, aggregates
directory/home counts, paginates the event photo editor and large administrative
lists, and adds hot-path indexes. `npm run benchmark:nas` is the repeatable
10-concurrent-user LAN check; final browser and upload-memory measurements must
still be captured on the physical DS920 before calling the targets certified.

### Verified measurements

- Local `linux/amd64` production image: **125,933,205 bytes (~120 MiB)**,
  below the 600 MiB release gate.
- Production build: **103 kB** shared first-load output; settings **135 kB**
  and QR labels **130 kB**.
- The build-budget script also measures representative normal and specialized
  routes from the generated app manifest, rather than relying only on console
  output.
- Concurrency, tenant isolation, theme, security, image-processing, and
  production build verification pass against the disposable PostgreSQL test
  service.

### Physical-NAS limitations

The repository cannot certify DS920 LAN latency, RSS during a maximum-size
upload, or real-disk `EXPLAIN ANALYZE` results from this development machine.
`npm run benchmark:nas` measures first-pass and warm p95, error rate, and an
optional ETag/304 media path. Run it on the deployed NAS with representative
owner, gallery, booking, QR, and authenticated-dashboard environment values;
record those results here before treating the hardware targets as achieved.
