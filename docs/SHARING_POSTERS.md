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
- When a photo's crop follows its detected subject, the partition also
  penalizes frame shapes whose crop would cut into the subject's box, so
  portraits win taller frames and wide subjects wider ones. Photos without a
  subject, or with a manual crop, keep the aspect-only behaviour, so a poster
  with no detection data lays out exactly as before.
- Preview and export both call `renderSharingPoster`; editor selection outlines
  are the only preview-only drawing.

## Crop modes

Each photo entry carries an optional `crop`:

- absent: the original behaviour. `focalX`/`focalY` are fractions of the
  pannable range (0 flush left/top, 1 flush right/bottom). Projects saved
  before crop modes existed stay in this mode until the owner changes it, so
  their crops never move behind their back.
- `{ mode: "auto" }`: the crop is centred on the subject detected on the
  server, nudged so the whole subject box stays visible when it fits, and the
  layout may reshape the frame around it. New photos default to this. Until
  detection has run the crop is centred, which looks as it did before.
- `{ mode: "manual", x, y }`: an anchor in image-normalized coordinates that
  the crop window is centred on, so it survives ratio, layout and weight
  changes. Dragging the preview switches a photo to manual, and content moves
  1:1 with the pointer.

`resolvePosterCrop` in `src/lib/sharingPosterLayout.ts` is the one place a
photo entry becomes a crop; drawing, dragging, the preview's subject marker
and the layout penalty all use it.

## Subject detection

Detection runs on the server, once per photo, and is stored on the `Photo`
row (`subjectX/Y`, `subjectBoxX/Y/Width/Height`, `subjectVersion`, all
fractions of the display-oriented image). `src/lib/subjectDetection.ts` reads
the 1280 px `-med` rendition, decodes it at most 512 px on the long side, and:

1. takes the point from libvips's attention crop strategy (luminance
   frequency, saturation, skin tones), feeding it a raw buffer whose short side
   already equals the target square so no resize happens and the reported
   coordinates are unambiguous; a runtime check confirms the point lies inside
   the crop window;
2. grows a box around it on a 96-cell energy grid of edges, saturation and
   skin tone, falling back to a fixed extent around the point.

It costs on the order of a hundred milliseconds per photo and well under 30 MB
transient. New uploads get it inside the compression job. Photos that predate
detection are backfilled by `sweepPhotoSubjects` after boot: it waits 20 s for
the compression sweep to pass, then works newest-first, one photo at a time
with a pause between, all through the single image-processing slot so uploads
keep priority. Any poster query that meets a photo without a current result
also nudges the same worker (bounded queue, never awaited), and the editor
polls the project a few times while a photo it follows is still pending, so
the crop settles without a reload. `SUBJECT_DETECTION_SWEEP=false` disables
the boot backfill. A failed decode is stamped with the version and no point,
so it is not retried every boot; raising `SUBJECT_DETECTION_VERSION` re-runs
everything.

## Ratio suggestion

The Layout tab suggests a poster ratio for the selected photographs
(`src/lib/sharingPosterRatio.ts`, shown by
`src/components/sharing-posters/SharingPosterRatioSuggestion.tsx`).

**Candidates.** The six preset ratios, then 3:4 (Xiaohongshu's portrait
format) and the camera's own 2:3 and 3:2, which have no button of their own,
then the current ratio if it is none of those.

**Scoring.** Each candidate is laid out with the real solver at the preview's
900 px width, from the same `posterLayoutItems` input the renderer uses, so the
layout scored is the layout the owner would get. Every frame is then cropped by
`resolvePosterCrop` exactly as it will render. Two shares come out of that,
both weighted like the layout weights photographs:

- **Subjects in view**: how much of each detected subject box stays inside its
  crop. Every detected subject counts, whatever the crop mode, since a manual
  crop that cuts a subject off still cuts it off on the poster.
- **Photographs in view**: how much of each photograph the crop keeps.

A ratio whose credits would crowd out the photographs (`footerTooTall`) is
never suggested.

**Choosing.** A different ratio is suggested only when it keeps at least as
much of both shares, within one point, and at least two points more of one.
The owner sees exactly those two numbers, so a suggestion can always be read
off them and never trades subjects for photographs, or the reverse, unseen.
Among such ratios, one that no other candidate improves on is preferred, so
taking a suggestion never leads straight to another one; improvement always
gains more than it can lose, so it cannot go round in a circle. Between those,
the solver's own objective decides: `-ln(share kept)` per photograph plus three
times the subject share cut away, plus half the share of the poster not given
to photographs. That prefers layouts that crop every photograph evenly and give
the photographs more of the poster. Earlier candidates win ties, so presets
come before the extra ratios.

When nothing improves on the current ratio the card says so, and only claims
that no other common ratio keeps more of both shares, which is true by
construction. It notes when some photographs are still waiting for detection,
since their subjects will change the comparison.

**Cost.** At nine photographs the solver takes about 20 ms a ratio, so the
editor compares ratios only after edits settle for 350 ms, one ratio per task,
and only when something that moves the layout or the crops changes; credits
text and colours do not trigger it. Until a new comparison lands the previous
card stays dimmed and its button disabled.

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

Glass is a gradient built from the photographs' colours, never their pixels,
so no shape from a photograph is repeated in the margin. It is drawn in
`src/lib/sharingPosterGlass.ts`:

1. **Colour statistics per frame.** What the frame actually shows (its
   resolved crop) is reduced to a 64 px sample and read in OKLab, where
   averages do not go muddy. Each pixel is weighted by colour: vivid colour
   counts up to eight times neutral grey, and near-black or near-white counts
   half, so a red costume shapes the palette more than the grey wall behind
   it. From that come a weighted mean, a mean for the band along each side,
   and a 6 x 6 grid of weighted means.
2. **A base gradient.** Every grid cell, placed where it sits on the poster
   and weighted by its colour and the area it covers, votes for the four
   corners. The corners are pushed a little apart from the overall mean and
   blended bilinearly, so a poster whose warm photographs sit top left and
   cool ones bottom right gets a gradient that runs the same way.
3. **Colour flowing from the frames.** Each side's colour spreads into the
   space beyond that side with a Gaussian falloff whose width is the softness
   setting (5 % of poster width plus twice `blurPercent`). Neighbouring sides
   blend around corners, and a gap between two frames becomes a mix of both.
   Lightness is eased 35 % toward the poster's mean, so hue carries the
   design and one near-black photograph cannot ink its margin; chroma is
   capped so the result reads as glass rather than neon.
4. **The glass finish.** The background colour is laid over the gradient at
   `tintOpacity` as frost, then a faint diagonal sheen, soft shadows under the
   frames, and a fixed-seed grain of about 1.5 % that dissolves the banding a
   smooth gradient shows when stretched to export size. Where two frames'
   shadows overlap in a narrow gutter they cancel, so gaps do not fill with
   dark lines. Frames keep the faint one-pixel line in the footer text colour,
   the same convention the site uses on image frames.

The colour work is pure and tested without a browser. It runs on small grids,
a field 96 px wide and a shadow layer 240 px wide, and both are cached by
crop, layout and softness, so typing credits or moving the tint repaints
without recomputing and a full-size export costs a handful of scaled draws.
The preview samples the 1280 px rendition and the export the full one; every
step is a weighted average that changes smoothly with its input, so the two
agree. Images are read with `getImageData`, which a same-origin image allows;
if one could not be read the poster falls back to its solid colour.

`blurPercent` keeps its name and range from the first glass implementation, so
posters saved with it still parse; it now sets softness rather than a blur
radius, and those posters render with the gradient.

## Export size

The longest edge is 2160, 4096 or 8192 px, and the other edge follows the
chosen ratio, so the largest poster is 8192 x 8192. `SHARING_POSTER_MAX_PIXELS`
is the square case at the maximum edge and must stay tied to
`SHARING_POSTER_MAX_EDGE`: while it was 12 MP it quietly shrank 4096 at 1:1,
4:5 and 4:3, so the option delivered less than it named.

Everything happens in the visitor's browser, from one canvas at the full
output size, drawn from the `full` renditions and released as soon as the file
is encoded. A poster at 8192 px holds roughly 270 MB of bitmap while it is
being built, which desktop browsers handle and small mobile ones may not: if
the canvas cannot be allocated or encoded the editor reports that the poster
could not be prepared, and a smaller size still works. The editor says as much
beside the setting whenever a size above 4096 is chosen. Posters saved with an
earlier maximum keep their stored choice and simply render it in full; the
layout is proportional to the width, so only the pixel count changes.

## Credits and metadata

Cosplayer CN and photographer are always rendered. CN is initially deduplicated
from selected photo credits in selection order. Photographs without a CN require
the photographer to review the shared poster-specific CN before export.

The titles printed before those two names are editable in the Credits tab and
saved as `credits.cosplayerLabel` / `credits.photographerLabel` (up to 80
characters, kept on one line, a trailing colon dropped because the line adds
its own). Absent or blank titles print the output language's defaults, "出镜 /
CN" and "摄影" or "Cosplayer CN" and "Photographer"; clearing a title or typing
the default back removes the field, so an untouched title keeps following the
language. Projects saved before titles existed print exactly as before, and
renaming a title does not stop CN from following the selected photographs.

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
image that contains the new dashboard routes. No new persistent media directory
or external service is required. Subject detection adds one background job: a
one-time sequential backfill after boot that uses the existing
image-processing slot and stays around a third of one core, plus on-demand
detection for photos a poster asks for. Posters themselves are still rendered
entirely in the browser.
