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
