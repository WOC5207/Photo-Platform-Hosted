# Gallery sharing posters

Sharing posters are photographer-owned projects at
`/[locale]/dashboard/sharing-posters`. A project stores a versioned composition
and references up to nine existing gallery photographs. JPEG and PNG files are
rendered entirely in the browser and are never written to the NAS.

## Layout convention

- The complete poster uses a preset or custom width:height ratio. The ratio
  includes both the photograph mosaic and its credit footer.
- The mosaic is a deterministic recursive partition of the available photo
  area. Each photograph starts with the same 1–5 visual weight used by the
  photographer homepage, but project adjustments do not modify gallery data.
- Every split evaluates both axes and chooses the crop-preserving result.
  Outer margin, gaps, and footer space are removed before frame calculation.
- Crop focal points are normalized (`0..1`), so they survive ratio, ordering,
  weight, and output-resolution changes.
- Preview and export both call `renderSharingPoster`; editor selection outlines
  are the only preview-only drawing.

## Footer spacing

`style.textGapPercent` is the gap between the bottom of the photo area and the
first credits line, as a percentage of poster width, adjustable from 0 to 8.
When it is set, the footer's bottom inset equals the outer margin so the credits
sit symmetrically inside the poster. Projects saved before the field existed
have no value and keep the spacing they were saved with (the footer padding was
derived from the margin and font size, and the gap was that padding plus the
margin); the Layout tab shows that legacy-equivalent value until the owner
moves the slider, which writes the field. `sharingPosterFooterGeometry` in
`src/lib/sharingPosterCanvas.ts` is the single, canvas-free source of this
arithmetic and is covered by `npm run test:sharing-posters`.

## Background

`style.background` is `{ mode: "solid" }` (the default, and what a project
without the field renders as) or `{ mode: "glass", blurPercent, tintOpacity }`.
Glass follows the site's blurred backdrop: each frame's outermost pixels are
stretched out to the canvas edges (`glassEdgeStrips` in
`src/lib/sharingPosterGlass.ts` tiles the space around a frame exactly), the
layer is blurred, and the background colour is laid over it at `tintOpacity`,
so the existing colour picker doubles as the tint and works for light and dark
looks alike. Frames get a faint one-pixel line in the footer text colour so
their edges still read against the glass.

All heavy work happens on a working layer about 240 px wide; the blur is a
downsample/upsample pyramid rather than `context.filter`, so one code path
serves every browser and a 12 MP export costs a single extra `drawImage`.
Browsers resample slightly differently, so the glass can differ marginally
between them, but preview and export always match within a session.

## Credits and metadata

Cosplayer CN and photographer are always rendered. CN is initially deduplicated
from selected photo credits in selection order. Photographs without a CN require
the photographer to review the shared poster-specific CN before export.

Camera, lens, event, date, and location are opt-in. Their displayed values are
saved in the project as a snapshot. Reopening a project never silently replaces
intentional edits; **Refresh from gallery** explicitly rebuilds the snapshot
from current source metadata.

## Storage, security, and deployment

`SharingPoster` is owner-scoped and guarded on every route. Autosave uses a
revision compare-and-increment; conflicts offer Reload or Save as copy.
Photo picker queries require an active session, remain owner-scoped, and exclude
unfinished or moderation-held photos. Missing/deleted sources remain visible as
unresolved project entries but block export.

Deployment requires running `prisma migrate deploy` and using an application
image that contains the new dashboard routes. No new persistent media directory,
background job, or NAS image-processing allowance is required.
