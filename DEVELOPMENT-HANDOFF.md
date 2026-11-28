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
