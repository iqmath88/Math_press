# Browser printing and geometry

Print Preview and browser printing use the same final sheet tree. The physical sheet dimensions are written to `@page` in millimetres; document margins are allocated inside that sheet. An allowance of 0.75 CSS pixels in the content row keeps subpixel rounding at a physical page boundary from displacing the footer. Normal sheets are kept as a unit in print. Oversized sheets opt out of that rule and report overflow so content can still flow. The paper wrapper has no independent minimum print height in preview mode.

The print options can suppress page furniture and watermarks independently while retaining page numbers and the reserved margins. The document template and its watermark do not change. Short Chromium output is inspected by Poppler for its actual page count, searchable page number and absence of browser URL annotations in text extraction. WebKit automation checks preview and print CSS; Safari's native print sheet cannot be driven or certified by that test.

A platform's print dialog may add date, URL and its own page numbers. These are external to the document. The UI prompts users to disable browser headers/footers when that control is available. MathPress does not claim to control native Safari print-dialog settings.

## Independent PDF options

A bundled PDF renderer would give explicit fragmentation and no browser chrome, but must retain Arabic shaping, searchable text, fonts, SVG and MathLive output. Before selecting a library, compare actual MathDoc fixtures for RTL and keeping equations and graphics selectable or vector-based. A server renderer could use Chromium PDF and support stronger parity, but would require explicit document upload, a retention model and an offline fallback. Rasterizing the whole document would lose text and vector quality. The current alpha retains the existing browser print pipeline.

The Apple PDF named in the alpha.4 brief was not included with the attached text. The automated fixture is a reconstruction with a short body, header, footer, page number and watermark. Its result cannot establish the original incident's root cause.

## Alpha.5 — Apple PDF incident

The supplied Safari/Quartz PDF has two physical A4 pages. The app footer reports
one page and appears on the second physical page. The browser contributes its own
URL, timestamp and physical page numbers. Poppler found no image objects, although
the iPad screenshot shows a selected bitmap. The PDF does not identify the app
commit. The original MathDoc and print settings were unavailable. The missing
image and split footer therefore remain unconfirmed on the original device.

Normal sheets reserve a single physical page box in print CSS. The footer stays
inside that box and does not participate in native fragmentation. Oversized
content retains normal flow and an overflow warning. Actual print image nodes
must finish decoding before the print button is enabled. Print diagnostics show
the version, CI or Vercel commit when available, paper dimensions, margins, and
warnings. Browser print headers remain a native print setting.

The short landscape-iPad-viewport test combines Arabic heading, inline and
display equations, a bitmap inserted using the app picker, and the footer.
Chromium checks one physical PDF page and an embedded bitmap. WebKit checks
print-media geometry and the decoded image. The iPad Safari Print/Share path
still needs manual verification with the original MathDoc.

Visual review of the Chromium PDF also exposed the editor's selection outline
around the selected image. The print clone now drops editor node and cell
selection classes before pagination. The regression requires the image to be
selected in the editor and the printed copy to have no selection decorations.

## P0 Safari recovery — four conic sections

The second supplied Apple PDF is A4 (595.276 × 841.89 pt), with eight physical
pages. Its metadata identifies Safari on iOS 27.2.1 (24B156) and Quartz, without
an application version, build hash, or cache identifier. Odd pages contain the
four conic sections. Even pages contain the app footer for the preceding
section. Poppler reports a rightmost body word boundary of 602.54 pt on each
odd page, about 7.27 pt past the physical page edge. Browser URL, date, and
native pagination appear on the PDF. The preview alias alone cannot identify
the build, nor establish that its service worker returned fresh assets.

A code-level defect was reproducible separately: the watermark stacking rule
had the same specificity as the absolute footer rule and appeared later. It
placed the footer back in normal flow even on a fixed-size sheet. It now
applies only to the header and body. The print wrappers also use a left-to-right
physical coordinate origin, with the paper retaining right-to-left content.
Each sheet explicitly uses the paper width variable and border-box sizing;
the dynamic @page rule and paper variables both come from paperDimensions.
No clipping or scale correction is used. Whether the attached Apple PDF used
the watermark rule or the same source build remains unknown.

The isolated desktop export probe uses the rendering pipeline without invoking
Safari's print dialog. Playwright renders the prepared pages and calls Chromium's
PDF API locally with the browser network disabled and browser header/footer
annotations disabled. The four-page fixture tests selectable, embedded Arabic
text, MathLive content, four source SVG plots, watermark, footer, and physical
PDF word bounds. This is a feasibility probe with a prepared local document,
not a browser-integrated PDF writer or a cold offline Safari export. Native
Safari on iPad must still be tested using the exported reference MathDoc and
the app's build diagnostics. Safari's own printable metadata remains subject to
the native dialog.

## Alpha.6 independent renderer feasibility

The isolated `experiments/pdfFeasibility.cjs` writes PDF bytes directly without
a browser print call. Its four-page A4 fixture uses Arabic with diacritics,
mixed Latin and Arabic digits, simple equation text, table cells, vector conic
paths, and page footers. It evaluates extracted logical order separately from
page count and glyph embedding. A second probe invokes pdf-lib in a disconnected
Chromium context with local UMD assets and creates a real PDF Blob.

| Mode | Pages | Bytes (DejaVu Sans) | Arabic and mixed logical extraction |
| --- | ---: | ---: | --- |
| PDFKit 0.21.0 | 4 | 13,961 | Failed |
| pdf-lib 1.17.1 + fontkit 1.1.1 | 4 | 421,860 | Failed |
| pdfmake 0.3.15 | 4 | 14,982 | Failed |
| PDFKit with ActualText | 4 | 14,604 | Failed |
| pdf-lib offline browser Blob | 1 | 419,693 | Failed |

PDFKit and pdfmake emitted embedded subset fonts with a Unicode mapping, but
the plain sentence and the mixed sentence both differed from the input in
Poppler extraction. DejaVu Sans covered the Latin equation glyphs that were
missing with the tested Noto Naskh file. Font coverage alone did not fix Arabic
ordering. The ActualText experiment also failed the same extraction check.
bidi-js 1.1.0 reports display order for comparison; the probe does not pass its
visually reordered string into a shaper. Reversing code points would split
combining sequences and is not an acceptable render path.

No candidate is approved. The fixture is a synthetic feasibility input, not a
serialized MathDoc or a proof of coverage for MathLive, JSXGraph, and complex
tables. Keep the probe outside the app bundle. Next validate a pipeline with
Unicode BiDi resolved runs, HarfBuzz or equivalent OpenType shaping without
losing cluster mappings, positioned glyph output and a logical Unicode mapping.
Check rendering and extraction in more than one reader before wiring export
controls or testing 200-page performance. Native Safari device validation of
browser printing remains open. The new version dialog reports the running
build, UTC build time, and the active browser print path.

Reproduce the probe with Poppler, a local TrueType font, and the exact package
versions above plus `svg-to-pdfkit@0.1.8`, installed in an isolated directory.
Set `NODE_PATH` to that directory's node_modules, then run
`node experiments/pdfFeasibility.cjs OUTPUT_DIR /path/to/font.ttf`.
Optionally set `PDF_PROBE_CHROMIUM` to a local Chromium executable to exercise
the disconnected browser Blob path. CI publishes the PDFs and JSON report
under the independent-pdf-feasibility artifact.

A follow-up rendered the Unicode BiDi runs separately, preserving logical
characters within each same-level run and positioning the runs in visual
order. The four-page PDFKit sample remained readable as PDF and embedded
its font. The plain and mixed logical extraction checks still failed. The
fixture requires cluster-aware text placement and a better logical mapping
than this run-only approach.

## Alpha.7 Print Edition vector proof

`experiments/printEdition.cjs` resolves visual BiDi runs, preserves characters
within each run in logical order, shapes them with HarfBuzz WASM 1.6.4, and
records source cluster offsets. The probe writes each positioned glyph as a
PDF vector outline and writes the plots as vector paths. It deliberately has
no text layer. Copy, search, and assistive reading are unavailable in these
test files. This is separate from the Professional Edition research on
logical Unicode mapping, ToUnicode, and ActualText. The alpha.6 extraction
failures remain relevant to that separate path only.

The synthetic conics fixture produced exactly 1, 4, 10, 50, 100 and 200 A4
sheets with footers rendered on each sheet. The 4-sheet file was 42,228
bytes, and the 200-sheet file was 2,217,118 bytes. The latter took 552 ms
in a single Linux Node run. RSS after export was 115,232,768 bytes; this is
whole-process memory sampled after the export, not peak or iPad memory.
The fixture repeats cached strings and paths and is not a general-document
benchmark. It does not exercise actual MathDoc layout, wrapping, MathLive
SVG, image fidelity, or the browser engine lifecycle.

The appearance is viable for this bounded fixture. Integration still needs
an adapter from MathPress's actual print-sheet geometry and visual comparison
of the reference MathDoc, including position of headings, formulas, footers,
and unclipped graphs. The experiment stays outside the app and does not
introduce a raster fallback or a button disconnected from functional export.

Run with the existing isolated engine dependencies plus
`harfbuzzjs@1.6.4`: `NODE_PATH=... node experiments/printEdition.cjs OUTPUT FONT.ttf`.
CI publishes the synthetic PDFs and JSON measurements in the independent-pdf-feasibility artifact.

## Alpha.8 experimental raster export

The UI takes physical page dimensions and sheets from the existing MathDoc
preview. It draws each sheet into a canvas on demand and embeds that page
in a PDF with point dimensions derived from the configured millimetres. It
draws static MathLive markup for formulas in the clone, retains source graph
SVG in the sheet supplied to the rasterizer, and releases each canvas after
encoding it. The dialog produces a PDF Blob for preview, download and system
sharing where supported. Cancellation is cooperative between pages. Preview
options set colour, economy, watermark and page furniture before export.

This is a labelled raster fallback. It cannot provide searchable text or
vector elements, and unsupported image crop and rotation or known overflow
block export. CSS fidelity is still limited by the renderer; device, complex
table and large-document validation are open. The HarfBuzz prototype remains
isolated until the shared-layout vector adapter is available.

The four-page conic regression exercises the download using the actual
MathDoc, asserts A4 and four physical pages, and prevents window.print from
being called. Chromium additionally exercises the first lazy export while
offline after the service worker has taken control. Static equation CSS is
loaded with the app; the PDF and canvas modules remain on demand. Immutable
hashed assets use a cache match without Vary to handle the different Origin
headers used by precaching and lazy requests. The canvas renderer snapshots
same-origin sheet styles to avoid losing styling in the offline clone.

## Alpha.9 physical DPI checkpoint

The existing independent raster exporter renders a fresh page buffer with integer
dimensions derived from sheet millimetres and the chosen DPI. The default is
300 DPI. Embedded A4 image sizes for 150, 216, 300, 450 and 600 were verified
from the PDFs using pdfimages: 1240×1754, 1786×2526, 2480×3508, 3720×5262 and
4961×7016. Cropped image insets are painted into a transparent target-DPI image
buffer; the clone retains its physical box, applies rotation through a CSS
transform, and preserves opacity. Source images and MathDoc are untouched.

The UI shows raw per-sheet buffer size, and actual file size after export.
Apple mobile/tablet-like clients use a conservative 16 million pixel budget;
other clients use 40 million. Larger sheets/resolutions are explicitly blocked
with no resolution downgrade. Each canvas is released between pages, and the
output aborts above a cumulative 96 MiB of compressed raster payload. Those
limits are safeguards, not measurements of browser or iPad peak RSS. The
renderer yields between sheets. The independent viewer, Files, sharing, and
memory behavior still require device validation. Print Edition remains raster.

On Linux Chromium, the cropped/rotated one-page A4 case took 407 / 570 / 679 /
1038 / 1098 ms at 150 / 216 / 300 / 450 / 600 DPI, respectively. Those are
single elapsed samples (including automation and download), not P95 values.
The 300-DPI conics case used all four 2480×3508 image pages, including the first
lazy render offline. Artwork from the real iPad described in the brief was
not separately attached to this turn; it was not used as a pixel baseline.
