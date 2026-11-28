# MathPress v0.8.0-alpha.1 — Advanced Glass Document Studio

Branch: `feature/v0.8.0-advanced-glass-document-studio`. The exact base is `884bd684a1e9076404db13b413d86ef9aea6e760` from PR #15. Use the current branch head as the continuation point.

## Implemented in the first increment

- Academic glass defaults for educational boxes, with restrained rounding and gradients. Existing explicit frames, colors, and identities remain usable.
- Text and raster watermarks, with color, opacity, size, rotation, position, parity/first-page targeting and optional repetition. The watermark is independent of pagination and never intercepts editing.
- A second text zone for the header and footer, optional separator rules, a starting number and Arabic digits in editing and print.
- Touch-accessible image reordering alongside the existing figure controls.
- MathDoc 6 for page studio attributes. MathDoc 3–5 continue to load. Older readers reject version 6, and malformed watermark/page settings are rejected before the active document is replaced.

## Work remaining

- Stable text wrapping and layering, direct manipulation handles, section-specific page furniture, rich headers, print presets and the rest of the advanced layout requirements.
- Geometry library expansion, editable angle measurements, advanced tables, rulers and text boxes.
- Full design audit, browser gate, performance comparison, and physical iPad and Windows validation. Test images, math focus and undo/redo, multiple paper sizes, offline restore and print parity.
- Full acceptance pack, including all visual cases and recordings from the task prompt.

## Verification and continuation

Use the Node version in `.nvmrc`. Run `npm ci`, `npm test`, then `npm run build`. Browser stories use `creative.e2e.cjs`, `studio.e2e.cjs`, and the repository workflow. Preview artifacts are attached to Actions; keep the PR draft and production deployment gated on main.

## Verified checkpoint

Code checkpoint `d7976e6c2b405b55e024777e49fc3c6ef640d277`. Files of interest are `watermark.ts`, `WatermarkSettings.tsx`, `pageFurniture.ts`, `PageSettingsDialog.tsx`, `Pagination.ts`, `PrintPagination.ts`, `PrintPreview.tsx` and `pageStudio.e2e.cjs`.

- Local production build and 127 unit tests passed. Chromium passed both page studio and Creative Studio, including iPad emulation. The latter test pins the gallery to match the current dock behavior.
- The Chromium PWA upgrade from v0.6.1-rc.2 preserved existing IndexedDB data. Text and logo PDFs were generated. Text watermark configuration round-trips in the MathDoc 6 browser test.
- Each performance row used 20 measured Chromium rounds. P95 elapsed time for closing the smart-math delimiter, v0.6.1-rc.2 → alpha.1: 1 page 27.37 → 34.82 ms, 10 pages 28.57 → 55.42 ms, 50 pages 51.32 → 68.98 ms, 100 pages 72.64 → 94.78 ms. The older-reference gate remains open. Against the exact parent 884bd68 at 10 pages, the median was 26.64 → 27.43 ms and P95 was 43.98 → 41.87 ms. This measures delimiter conversion, not interactive MathLive exit.
- [Draft PR #16](https://github.com/iqmath88/Math_press/pull/16), [CI for the code checkpoint](https://github.com/iqmath88/Math_press/actions/runs/46133567345) and [Vercel preview build](https://vercel.com/iqmath88s-projects/math-press/Vi1qKbPA4nv3eqGyD74UHutqUZvA).

Continue with the failing CI step if present. Then measure comparable existing workflows before introducing wrapping and layers. Implement and validate these together so they cannot introduce editor/print page disagreements. A document supports one selected watermark, text or image. Section-specific and simultaneous marks are deferred.
