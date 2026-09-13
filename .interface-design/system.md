# Photo Platform Interface System

## Direction

The product follows a **digital contact sheet** direction: a calm working surface
for photographers that borrows from darkrooms, archival print boxes, proof
sheets, and editorial photography books. Visitor-facing pages should let images
lead. Photographer and platform-management pages should feel precise, compact,
and dependable without becoming a generic SaaS dashboard.

The interface should feel:

- Quiet enough that photographs remain the focal point.
- Warm and tactile rather than cold or clinical.
- Editorial on public and page-level headings.
- Operational and highly legible around controls, metadata, and status.
- Deliberate: one obvious primary action per view, with secondary controls
  visually receding.

The signature is the **indexed contact-sheet marker**: small tabular numbers,
metadata labels, active rails, and inset image outlines that make pages and photo
cards feel catalogued rather than merely boxed.

## Palette

Use semantic tokens from `src/app/globals.css`; do not introduce unrelated
hardcoded neutral or accent colors.

### Light

- Canvas / warm paper: `#f3f0e9`
- Sheet: `#fbfaf6`
- Raised paper: `#fffefb`
- Inset control: `#ece8df`
- Deep paper: `#e4ded3`
- Graphite ink: `#211d18`
- Supporting graphite: `#514a41`
- Tertiary graphite: `#6f665b`
- Silver metadata: `#6a6055` (readable on the inset and deep surfaces)
- Safelight accent: `#a44f25`
- Strong safelight: `#7c3718`

### Dark

- Darkroom canvas: `#100f0d`
- Darkroom sheet: `#181613`
- Raised darkroom surface: `#1f1c18`
- Inset control: `#0c0b0a`
- Deep darkroom surface: `#25211c`
- Primary ink: `#f1ece4`
- Safelight accent: `#e29a68`

Accent is scarce and functional. Use it for the primary action, active
navigation rail, current step, focus ring, progress, and indexed markers. Status
colors remain semantic and must not compete with the primary accent.

Each photographer may replace the safelight accent for their own public site.
Derive the strong, surface, and contrast-foreground variants through
`siteThemeStyle`; do not place a saved hex directly into individual
components. The platform directory and platform-administration workspace keep
the platform safelight identity.

Photographers may also build independent light and dark semantic palettes for
the public site: canvas, panel, inset field, text, and buttons/accent. Keep
these as semantic tokens rather than styling individual components. The
appearance editor uses one Light/Dark mode switch, a single live public-site
specimen, and compact swatches so each palette is judged as a system without
doubling the page length. The selected mode controls both preview and
randomization. Empty values use that mode's contact-sheet defaults; missing
surface/text values are derived through the theme-color helpers. Primary text
must maintain at least 4.5:1 contrast against the canvas, panels, and fields,
and button foreground remains automatic.

### Photographer dashboard appearance

The photographer dashboard offers two account-level appearance modes:

- **Platform default** keeps the standard contact-sheet light and dark palettes.
- **Match public site** applies the photographer's existing public light and
  dark semantic palettes to the dashboard workspace.

The choice changes color identity, not the dashboard's operational structure.
Typography, spacing, radii, density, navigation hierarchy, and semantic status
meaning remain platform-controlled. Success, warning, danger, maintenance, and
equipment-condition colors are never replaced by photographer-selected accent
colors. Public background photography does not enter the dashboard because
dense controls require a stable canvas.

Scope matched palettes to `/dashboard` only. Login, onboarding, the public
directory, and `/admin` retain the platform palette. Theme mode remains the
single document-level light/dark preference; dashboard appearance must not add
a second light/dark switch. Theme-aware floating layers must inherit the active
dashboard palette even when rendered through a portal.

The appearance editor presents this as a restrained two-choice setting and
lets the existing palette specimen switch between a public-site and dashboard
preview. Default new and existing accounts to **Platform default**, so enabling
dashboard branding is always deliberate.

## Depth and Surfaces

The primary depth strategy is **surface shifts plus low-opacity borders**.

- Page canvas: `bg-page`
- Standard section/card: `bg-surface border-border`
- Raised card/popover/action tray: `bg-raised border-border`
- Input/select/textarea: `bg-control border-border-strong`
- Secondary grouped surface: `bg-surface-2`
- Shadows are reserved for genuinely floating layers such as menus, drawers,
  and sticky action trays.
- Sidebars share the page canvas and use a quiet divider.
- Images receive a one-pixel inset outline through `ui-image-frame`.

Radius scale:

- Controls: `rounded-lg` / 8px
- Cards and panels: `rounded-xl` / 12px
- Avoid pill shapes except for true compact statuses or tags.

## Typography and Hierarchy

Three roles:

- Interface: Avenir Next, Segoe UI, and multilingual sans-serif fallbacks.
- Editorial: Iowan Old Style, Baskerville, Times New Roman, and CJK serif
  fallbacks through `font-display`.
- Metadata: SFMono-Regular, Consolas, and monospace fallbacks through
  `font-meta`; always tabular.

Hierarchy uses a roughly 1.25 scale, supported by weight, color, and spacing:

- Metadata/caption: 11–12px, tracked, muted or accent.
- Body: 16px; compact operational text: 14px, regular/medium.
- Component title: 16–18px, semibold.
- Section title: 22–28px, editorial semibold.
- Page title: 32–40px, editorial semibold with approximately `-0.03em`
  tracking.
- Public hero: 48–72px where space permits.

Every view has one focal point. Usually this is the page title plus one primary
action, or the selected photograph in a visitor gallery. Use `ui-balance` on
headings and `ui-pretty` on explanatory copy.

## Spacing and Density

Base unit: **4px**.

- Micro gaps: 4–8px.
- Control/card internals: 12–16px.
- Related component groups: 16–24px.
- Sections: 32–48px.
- Management content maximum width: `max-w-7xl`.
- Management desktop sidebar: 272px / `17rem`.
- Controls must retain at least a 40px hit area and 44px on narrow screens.
  Language links and theme controls use 44px targets at all widths.

Operational screens are compact but never cramped. Visitor pages use more open
space around photographs and editorial headings.

## Reusable Patterns

### Page header

Use `PageHeader` for management pages:

- 11px indexed marker in safelight accent.
- 32–40px editorial title.
- Supporting copy below the title.
- One optional action aligned to the trailing edge.
- Quiet bottom border and 24px bottom padding.

### Section heading

Use `SectionHeading` for repeated sections:

- Short safelight rail at the left.
- 22px editorial semibold title.
- Optional restrained supporting copy.

### Disclosure sections

Use `DisclosureSection` for advanced, secondary, and infrequently changed
controls. The summary remains a native keyboard-operable disclosure with a
44px mobile target, a concise title, and optional live metadata. Primary task
controls must not be hidden behind it: schedule management, checklist progress,
and QR scanning remain immediately visible. On wide workbenches a disclosure
may stay open while collapsing by default on mobile.

### Form action bar

Use `FormActionBar` for long settings forms. It appears only while the form is
dirty, pending, successful, or failed, inherits the active dashboard palette,
and respects mobile safe-area insets. Do not reserve permanent page height for
an idle save bar or allow it to cover the final field.

### Filtered and paginated data

- Use `FilterToolbar` for search and compact category/status controls.
- Normal management browsing is bounded to 50 rows; photo-management batches
  use 48 thumbnails so the first usable contact sheet remains light.
- Preserve selected IDs across loaded photo pages.
- Use `PaginationNav` for server-rendered lists and maintain active filters in
  its links.
- Full inventory loads are reserved for an explicit reorder mode. Normal
  inventory browsing must not hydrate drag-and-drop behavior.
- Wide layouts may use tables and mobile layouts cards, but both must expose
  the same labels, status, actions, and pagination semantics.

### Status segmented control

Use `StatusSegmentedControl` for the checklist's In use, In inventory, and
Broken operations. It owns pending/disabled behavior, semantic colors,
accessible announcements, and 44px touch targets. Quick status updates must
preserve private notes and remain owner-scoped on every write.

### Buttons

- Default height: 44px; compact height: 40px (44px on narrow screens).
- Primary: safelight background, light text.
- Secondary: raised surface with stronger quiet border.
- Ghost: transparent, gains `accent-surface` on hover.
- Danger: semantic danger surface and border.
- Focus: opaque two-pixel safelight outline with 3px clearance, including
  controls that do not use the shared button primitive.
- Press: scale to `0.97` when reduced motion is not requested.

### Fields

- Inset `bg-control` surface.
- 8px radius and quiet strong border.
- Safelight border/ring on focus.
- Labels rely on weight and text hierarchy instead of large size.
- Use `controlClasses` for booking, album, login, and search fields. Mobile
  input text is 16px. Field borders have dedicated light/dark contrast tokens.

### Navigation

- Active management item uses a safelight-tinted surface and a two-pixel left
  rail.
- Inactive items remain graphite and gain a subtle surface on hover.
- Workspace switch uses an inset group with a raised selected option.
- Desktop utilities expose the public-site link, language, and theme above
  the account control. Theme controls share the document's effective state.
- The public header switches to its compact menu below 1280px so translated
  labels fit. Every main landmark is a keyboard skip destination.

### First-use guidance

- Use `EmptyState` for empty booking lists, album lists, and the directory.
- Lead with a 32px line icon and editorial heading, then readable supporting
  copy and a single creation action. Avoid duplicating that primary action
  in the page header when the list is empty.
- For author workflows, use three indexed steps on a raised lower surface;
  stack the steps on phones. Keep English and Chinese copy equivalent.

### Photo cards and image lists

- Include a two-digit `font-meta` index where the layout supports it.
- Place images in an inset-outlined frame.
- Keep operational metadata beneath, not over, the photograph unless the
  overlay is a compact status.
- Editing categories use native `<details>` sections to keep dense forms
  scannable.

### Equipment inventory and QR labels

- Equipment tiles use a photographer-defined persistent order. A quiet six-dot
  drag handle is the desktop affordance; adjacent up/down controls provide the
  same operation for touch and keyboard users, with live save feedback.
- Category filtering preserves the full inventory order: moving visible items
  changes only their positions among the hidden items, never ownership scope.
- QR label artwork layers in this order: white label stock, optional cover-fit
  background at the chosen opacity, QR code, optional logo, then equipment name
  and short UID metadata when enabled.
- Equipment name and UID share one text-size control. One millimetre-based
  element-spacing control governs active logo-to-QR, QR-to-text, and
  name-to-UID gaps in preview and exported artwork.
- Whole-label print rotation uses four explicit quarter-turn positions. Preview,
  PDF, and PNG rotate the complete composition together; 90° and 270° swap the
  output dimensions instead of cropping or reflowing the artwork.
- QR label printing starts with equipment selection. Label content, spacing,
  background, physical size, and print rotation use native disclosure groups
  with live metadata summaries so the left workbench stays compact beside the
  sticky preview.
- Keep PDF as the primary print path and PNG as a secondary export. PNG output
  is one 300 DPI image per selected item and must match the live preview.
- In the mobile checklist scanner, the live camera image remains unobstructed.
  Camera selection, running status, and the stop action sit in a separate
  full-width control footer below the viewfinder with 44px touch targets.

### Homepage infinite archive

- Treat the homepage photo stream as a progressively revealed contact sheet,
  not a finite “recent work” sample: server-render the first 24 public photos
  and request later batches as the visitor approaches the trailing edge.
- Preserve album recency and photographer-defined gallery order. When a batch
  ends inside an album, merge the continuation beneath the existing album
  heading without repeating the heading or any photograph.
- Keep photographs as the focal point. Loading chrome stays below the current
  contact sheet and uses the indexed `font-meta` marker plus muted operational
  text; it must not compete with album titles or imagery.
- Automatic loading must retain a native 44px manual “load more” fallback,
  explicit loading and retry states, an `aria-live` count announcement, and a
  quiet bilingual archive-end marker that stacks cleanly on narrow screens.
- Transport data in bounded pages and apply the central public-photo predicate
  to every batch. Infinite discovery must never weaken moderation, publication,
  or tenant boundaries.
- Do not create continuous movement, repeat photographs to fill space, or
  replace the contact sheet with generic equal-sized cards.

### Cosplan poster slots

- Keep the poster canvas as the dominant focal point. Slot controls use compact
  indexed markers and the existing warm sheet/control surfaces rather than a
  second visual language.
- Character insertion is a two-step task: choose or upload a character, then
  choose a bilingual named slot. Slot buttons retain 44px touch targets and the
  pending character remains explicit until placed or cancelled.
- Render poster content in semantic strata: full background, clipped character
  images, foreground artwork/borders, text, then editor-only transform chrome.
  Layer reordering may reorder within image or text strata but must never move
  a character over a printed border or text underneath the foreground.
- Snapshot slot geometry and immutable asset URLs into versioned local drafts.
  Published admin layout changes must not silently alter a visitor's saved
  composition.
- Admin slot editing uses direct manipulation for position plus numeric fields
  for precise x/y/width/height entry. Keep save/error feedback adjacent, and do
  not introduce continuous animations or decorative overlays.
- Automatic white-space detection is a review workflow: a single quiet action
  reveals numbered dashed candidates on the poster, recommended/review labels
  in a bounded list, and explicit add or destructive replace actions. Advanced
  sensitivity and inset controls live in a native disclosure and never update
  continuously.
- The admin slot proof is the focal surface: it occupies the open right column
  and remains sticky on desktop. On phone and tablet it becomes a compact,
  collapsible bottom-right proof so coordinate and detection controls remain
  reachable without losing the poster. Irregular detected slots retain their
  polygon contour through proofing, foreground generation, visitor clipping,
  saved drafts, and export; manual slots remain rectangles.

### Upload wizard

- The current step uses the safelight accent and an active rail.
- The upload drop zone is accent-tinted and contains the dominant upload
  button.
- Progress uses the accent.
- The bottom action tray is sticky, raised, and visually distinct.
- When progression is blocked, the tray explains the required action and the
  relevant section receives an accent guidance ring.

### Booking selection

- Date and slot choices use raised/inset surfaces, with accent reserved for the
  current selection and the forward action.
- Multiple selections remain visible in the sticky summary/cart.
- Review separates the selected schedule from contact details rather than
  presenting one uninterrupted form.
- Shared visitor identity and contact details are entered once. Character or
  subject information belongs inside each selected slot card so multi-slot
  bookings can describe different subjects without duplicating contact data.
- A new event may opt into price display in context. The enable action reveals
  the current versioned responsibility agreement; only affirmative acceptance
  marks the event form ready, and persistence happens atomically with creation.
- Private booking pages lead with a dated edit-window status. When editing is
  available, time and visitor details live in one collapsed management panel;
  the save action is the single accent focal point and cancellation remains a
  separate destructive action.

## Motion and Accessibility

- Animate only color, opacity, and transform for routine interactions.
- Interaction duration: roughly 150ms with
  `cubic-bezier(0.23, 1, 0.32, 1)`.
- No continuous decorative movement.
- Honor `prefers-reduced-motion`.
- All actions use native interactive elements.
- Preserve visible keyboard focus, disabled, loading, empty, success, warning,
  and error states.
- Visitor-hidden moderation content must remain private regardless of visual
  treatment.
- Decorative accents and small accent-colored text are independent. Use
  `accent-text` for text below 18px; it is derived to maintain at least 4.5:1
  contrast on the page, raised, and inset-control surfaces.

## Performance Budgets

- Shared first-load JavaScript: at most 105 KB gzip.
- Normal dashboard routes: at most 125 KB first-load JavaScript.
- Specialized settings and QR workbenches: at most 140 KB first-load
  JavaScript; QR rendering/export libraries load only after selection or an
  export request.
- Public media metadata may be cached on the server for 20 seconds and in the
  browser for 10 seconds. Private originals and authenticated media stay
  `private, no-store`.
- Public image frames reserve dimensions/aspect ratio and use lazy loading and
  asynchronous decoding unless they are the single above-the-fold priority
  image.
- The DS920+ production path pulls an immutable `linux/amd64` image; source
  builds are a troubleshooting/development override rather than the default.

## Guardrails

- Do not replace the warm palette with generic gray/blue SaaS colors.
- Do not make every container an identical card.
- Do not use accent decoratively across large areas.
- Do not use dramatic shadows or gradients.
- Do not crop or repeat photographs merely to fill layout space.
- Do not create new button or field styling when the shared primitives fit.
- Keep bilingual English/Chinese layouts and longer translations in mind.
