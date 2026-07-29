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
- Tertiary graphite: `#71685d`
- Silver metadata: `#998e80`
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
`themeColorStyle`; do not place a saved hex directly into individual
components. The platform directory and management workspace keep the platform
safelight identity.

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
- Operational body: 14–15px, regular/medium.
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

### Buttons

- Default height: 44px; compact height: 36px.
- Primary: safelight background, light text.
- Secondary: raised surface with stronger quiet border.
- Ghost: transparent, gains `accent-surface` on hover.
- Danger: semantic danger surface and border.
- Focus: two-pixel safelight ring with page-colored offset.
- Press: scale to `0.97` when reduced motion is not requested.

### Fields

- Inset `bg-control` surface.
- 8px radius and quiet strong border.
- Safelight border/ring on focus.
- Labels rely on weight and text hierarchy instead of large size.

### Navigation

- Active management item uses a safelight-tinted surface and a two-pixel left
  rail.
- Inactive items remain graphite and gain a subtle surface on hover.
- Workspace switch uses an inset group with a raised selected option.

### Photo cards and image lists

- Include a two-digit `font-meta` index where the layout supports it.
- Place images in an inset-outlined frame.
- Keep operational metadata beneath, not over, the photograph unless the
  overlay is a compact status.
- Editing categories use native `<details>` sections to keep dense forms
  scannable.

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

## Guardrails

- Do not replace the warm palette with generic gray/blue SaaS colors.
- Do not make every container an identical card.
- Do not use accent decoratively across large areas.
- Do not use dramatic shadows or gradients.
- Do not crop or repeat photographs merely to fill layout space.
- Do not create new button or field styling when the shared primitives fit.
- Keep bilingual English/Chinese layouts and longer translations in mind.
