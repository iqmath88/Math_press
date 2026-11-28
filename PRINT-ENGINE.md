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

The ten-page workbook combined the existing calculus and conics teaching
documents. The 300-DPI Chromium run measured 3.87 s end to end and
2,814,425 output bytes. CDP sampled JavaScript heap at 24,613,116 bytes
before export and 54,517,248 bytes maximum at 200-ms sampling. These do not
include Canvas process memory or establish iPad headroom. Cancelling a
second export produced no download and kept all ten sheets.

Extended Chromium/Linux stress runs used fresh sessions and repeated the mixed
ten-page workbook as ten-page chapters separated by a manual break. All
outputs were checked for the expected physical page count and 2480×3508
embedded page images at 300 DPI.

| Pages | Export elapsed (after preview) | File bytes | Sampled JS heap before / peak |
| ---: | ---: | ---: | ---: |
| 50 | 18.58 s | 14,091,353 | 23.64 / 77.15 MB |
| 100 | 43.14 s | 28,235,864 | 42.92 / 103.00 MB |
| 200 | 145.68 s | 56,537,333 | 59.42 / 143.14 MB |

The first 200-page attempt exceeded a 30-second preview wait. It completed
on retry with a 120-second preview allowance. One Linux renderer RSS
observation during that longer run was roughly 1.5 GB. A sampled JS heap
series does not measure canvas or whole-process peak memory. Do not
interpret these single desktop runs as mobile acceptance or equation
performance comparisons. Use smaller export ranges until the large
iPad workload is independently verified.

## Alpha.10 high-resolution tiled raster

A4 at 450 and 600 DPI uses overlapping raster tiles. The normal A4 path up to
300 DPI still uses a single buffer for speed. The PDF page is created once and
each JPEG is embedded in physical coordinates, clipped to its nominal tile
rectangle; eight extra source pixels per internal edge provide codec bleed.
The renderer reuses one output canvas and clears it between tiles. Apple
mobile/tablet-like clients use a 1024-pixel tile core; desktop uses 2048.
The 96 MiB cumulative encoded budget remains. An oversized transformed
source image still reports an explicit error rather than silently downsampling.
html2canvas can allocate auxiliary canvases for image and gradient backgrounds.

A Chromium run using the tablet budget generated six calculus pages at 600 DPI.
Poppler verified 210 tile images at 600 pixels per inch. The file was
4,893,364 bytes and the end-to-end export took 32.58 s. Instrumentation recorded
a maximum single canvas of 1,343,544 pixels in this workload. This is the
largest observed canvas allocation, not total browser or device memory.

Tiled follow-up: clipping rectangles overdraw three shared source pixels
on internal edges. The enclosing eight-pixel bleed remains, and adjacent
opaque samples cover the PDF reader's antialias line. Poppler thumbnails
were visually reviewed on the six-page calculus fixture. Identical JPEGs
share a PDF image object using SHA-256 in secure browser contexts. The
crop buffer is encoded to a temporary Blob URL and reclaimed at the end
of the sheet. Memory hints can select 512-pixel or 1024-pixel cores on
lower-memory clients. Those hints supplement physical DPI and canvas
bounds. Auxiliary image buffers and overall browser memory are separate.

The six-page file in the overlap/dedup run was 4,137,372 bytes versus
4,893,364 bytes in the initial tiled run. Concurrent local builds mean
the elapsed times from those two runs are not a controlled comparison.
The follow-up verifies the 600-DPI export can be cancelled and all six
MathDoc sheets remain available.

Matching 300-DPI Chromium/Linux workloads were rerun after the tiled changes.
These are single runs with the existing whole-page A4 fast path, not P95.

| Pages | Alpha.9 / alpha.10 elapsed | Alpha.9 / alpha.10 file bytes | Alpha.9 / alpha.10 sampled peak JavaScript heap |
| ---: | ---: | ---: | ---: |
| 50 | 18.58 / 19.16 s | 14,091,353 / 13,934,809 | 77.15 / 68.41 MB |
| 100 | 43.14 / 42.73 s | 28,235,864 / 27,924,604 | 103.00 / 104.10 MB |
| 200 | 145.68 / 142.61 s | 56,537,333 / 55,914,631 | 143.14 / 149.55 MB |

The browser heap samples do not cover the canvas backing store, GPU, or
total system peak. Improvements in PDF storage do not establish lower
overall memory at 200 pages.

## Alpha.11 raster stage measurements

PDF generation still uses the established tiled exporter. One ten-page
Chromium run at 300 DPI took 3.383 s end to end. Measured phases were
60.7 ms for staging, 2,127.1 ms for tile rendering (including iframe cloning
and style/font work), 580.8 ms for conversion/encoding and PDF embedding,
and 8.1 ms for serialization. Canvas rendering dominates the measured
phase totals. This does not isolate cloning from image or SVG rasterization
and excludes time spent preparing the preview. Linked stylesheet nodes
are skipped in the renderer's cloned iframe because the same-origin sheet
rules are already snapshotted and injected. MathLive static markup is
reused within one job using a bounded cache.

A 50-page expanded workbook run measured 18.413 seconds after preview.
This is above the 15-second gate. The 40% peak-memory target has not been
demonstrated. Keep the existing raster and quality settings while profiling
which work inside html2canvas scales with document size.

Expanded-workbook alpha.11 samples at 300 DPI:

| Pages | Export after preview | PDF bytes | Sampled JS heap peak |
| ---: | ---: | ---: | ---: |
| 50 | 18.41 s | 14,077,809 | 78.38 MB |
| 100 | 65.58 s | 28,209,884 | 101.10 MB |
| 200 | 139.81 s | 56,487,265 | 144.37 MB |

All page counts and physical image dimensions passed. These are single
Linux Chromium observations. The 100-page run overlapped template QA,
so do not use it as a controlled before/after comparison. Content styling
also changed since alpha.10. The 50/100/200 targets of 15/30/75 seconds
remain open, as does a separate peak renderer memory gate.
