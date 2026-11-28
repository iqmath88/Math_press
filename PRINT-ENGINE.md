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
