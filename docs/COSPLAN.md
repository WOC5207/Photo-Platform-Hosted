# Public Cosplan poster creator

Cosplan is a platform-owned, public poster editor at `/zh/cosplan` and
`/en/cosplan`. It is independent from photographer accounts and public sites.
Visitors do not need to sign in.

## Visitor workflow

1. Choose one of the published backgrounds. Its administrator-defined width
   and height become the exact PNG export dimensions.
2. Search Bangumi explicitly and choose a result, or upload a JPEG, PNG, or
   WebP from the device. Search never automatically selects a character. When
   the chosen template defines character slots, choose the character first and
   then choose its named slot. The character is contained and centered there.
3. Drag, resize, rotate, crop, duplicate, delete, or reorder image layers. A
   slotted character is clipped to its saved slot, so it cannot cover another
   day or column. Add
   multiple text layers and edit their font, size, color, weight, and alignment.
4. Use Undo/Redo or the numeric position and size fields when precise placement
   is needed. On phones and tablets, tools open from the safe-area-aware bottom
   toolbar while the fitted canvas remains reachable.
5. Export the composition as a PNG. Rendering, visitor uploads, drafts, and the
   final file remain in the browser and do not create a NAS processing job.

One versioned draft is autosaved in IndexedDB. Local image blobs are stored in
that draft. A returning visitor can restore it or start again. Background asset
URLs are immutable, so replacing a template does not silently change an
existing draft. Deleting a template deliberately removes all of its versions.

Visitor uploads are limited to 15 MB and normalized in the browser to at most
4096 px on either side and 12 megapixels. A composition accepts up to 20 image
layers and 30 text layers. These browser limits are for predictable mobile
memory use; the server never receives visitor artwork or exported posters.

## Administrator workflow

Open **Platform admin → Cosplan templates** (`/admin/cosplan`). Administrators
can:

- upload a background and set English and Chinese titles;
- set the finished export size from 320–4096 px per side, up to 12 megapixels;
- publish or unpublish a background;
- reorder the public background gallery;
- edit titles and dimensions; and
- replace the current image without invalidating drafts that reference an
  older image version;
- draw and name up to 12 rectangular or automatically detected irregular
  character slots directly over a template;
  and
- optionally upload a transparent PNG/WebP foreground when automatic contours
  are not precise enough for the artwork.

Saving slots creates a new immutable foreground asset from the current full
background. The server removes each rectangular or polygonal slot from this foreground, then
the editor renders in this fixed order: full background, clipped character
layers, foreground/borders, text layers, and editor-only selection controls.
This keeps the white stock behind characters and printed day dividers above
them. Saving new slots or replacing a background increments the template
layout version. A version-2 browser draft snapshots its slot geometry and
foreground URL, so a later admin edit does not silently move or reframe that
draft. Existing version-1 templates and drafts remain freeform.

### Automatic light-area detection

The slot editor can propose rectangular and irregular slots from white, cream, and light gray
areas in the saved background. Detection runs only when an administrator
presses **Detect white space**. Results appear as selectable, numbered candidate
frames and remain browser state until the administrator adds or replaces slots
and then saves the layout.

Strict, standard, and loose modes vary the minimum channel brightness and
allowed color spread. Standard is the default. A configurable safe inset is
applied to the threshold mask in original-template pixels before tracing. Suggested candidates are
selected by default; edge-connected, highly irregular, and almost-full-page
areas are marked for review. The tool does not infer dates or slot names.

The server decodes a maximum 1024px working image through the existing Sharp
queue, then performs thresholding, bounded erosion, four-way connected-component
analysis, and simplified contour tracing in a worker thread. Concave outer
boundaries and meaningful internal cut-outs are stored as normalized polygon
contours; near-rectangular regions remain compact rectangle slots. One detection may run while
two wait; additional requests receive a retryable busy result. Successful
results are cached in memory for 10 minutes by immutable asset version and
detection settings, with at most 32 entries. No detection preview files are
written to disk.

Uploaded backgrounds are normalized to WebP through the existing single-slot
Sharp pipeline and stored below the persistent photo volume at
`platform/cosplan/templates`. Template records are platform-wide and have no
photographer owner.

Foreground generation runs only when an administrator saves slots, replaces a
background, or uploads a foreground. It uses the same one-at-a-time image
processing queue as other Sharp work, so visitor editing and PNG export stay
browser-only and do not add recurring load to the DS920+.

Automatic detection is intentionally limited to contiguous light regions.
Dark or textured openings and semantic day recognition continue to use manual
slots or a transparent custom foreground. Very detailed boundaries are
simplified to keep drafts and canvas clipping bounded.

## Bangumi adapter and cache

Character search is sent only after the visitor submits a name. The server
requests 20 non-NSFW results per page, identifies this application with a
dedicated User-Agent, times out upstream calls, and caches successful searches
for 10 minutes. Search results retain links to their Bangumi character pages.

Only a selected character image is imported through the same-origin endpoint.
The server resolves the image from the Bangumi character ID, permits only HTTPS
images from `lain.bgm.tv`, refuses redirects, caps downloaded bytes and decoded
pixels, and normalizes the result to WebP. The disk cache expires after seven
days and is trimmed to 512 MB. Bangumi failures do not affect local uploads,
draft editing, or export.

Source availability is not a reproduction license. The editor displays a
rights reminder and the source link so visitors can verify and use only artwork
they are permitted to reproduce.

## Deployment

This feature adds `CosplanTemplate` and `CosplanTemplateAsset`, followed by an
additive slot/foreground migration on `CosplanTemplate`. Deploy the new
application image normally; the container startup migration runs both additive
database migrations. Keep the existing photos volume mounted because it stores
background and foreground versions plus the bounded character cache. No new
environment variables or services are required.
