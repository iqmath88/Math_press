# Browser printing and geometry

Print Preview and browser printing use the same final sheet tree. The physical sheet dimensions are written to `@page` in millimetres; document margins are allocated inside that sheet. An allowance of 0.75 CSS pixels in the content row keeps subpixel rounding at a physical page boundary from displacing the footer. Normal sheets are kept as a unit in print. Oversized sheets opt out of that rule and report overflow so content can still flow. The paper wrapper has no independent minimum print height in preview mode.

The print options can suppress page furniture and watermarks independently while retaining page numbers and the reserved margins. The document template and its watermark do not change. Short Chromium output is inspected by Poppler for its actual page count, searchable page number and absence of browser URL annotations in text extraction. WebKit automation checks preview and print CSS; Safari's native print sheet cannot be driven or certified by that test.

A platform's print dialog may add date, URL and its own page numbers. These are external to the document. The UI prompts users to disable browser headers/footers when that control is available. MathPress does not claim to control native Safari print-dialog settings.

## Independent PDF options

A bundled PDF renderer would give explicit fragmentation and no browser chrome, but must retain Arabic shaping, searchable text, fonts, SVG and MathLive output. Before selecting a library, compare actual MathDoc fixtures for RTL and keeping equations and graphics selectable or vector-based. A server renderer could use Chromium PDF and support stronger parity, but would require explicit document upload, a retention model and an offline fallback. Rasterizing the whole document would lose text and vector quality. The current alpha retains the existing browser print pipeline.

The Apple PDF named in the alpha.4 brief was not included with the attached text. The automated fixture is a reconstruction with a short body, header, footer, page number and watermark. Its result cannot establish the original incident's root cause.
