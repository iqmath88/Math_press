# Glass Creative Studio preview.3 follow-up

The working branch is `feature/v0.7.0-creative-studio`, tracked by draft PR #15. Start from the latest commit on that branch and compare against preview.2 commit `d84bc52563522e0e2749a7870d603da069b519fa`.

## Verification gates

- Run the focused equation-close benchmark against rc.2 with 10, 50 and 100 page fixtures, 20 measured rounds per size, and a quiet browser host. The gate is a maximum 15% P95 regression under equivalent conditions. Keep historical measurements distinct from contemporaneous results.
- Follow the image import diagnostic in `creative.e2e.cjs` on standalone WebKit. Verify native clipboard paste, file selection, empty MIME, backup restore, IndexedDB and offline operation. Keep the 30-round editing history check unchanged. A prior run already failed on the history check before reaching the image scenario.
- Use a physical iPad and Windows device before release approval. Record Safari touch behavior and native printing separately from Playwright emulation.
- Check the browser PDF and editable MathDoc samples in the print-compatibility artifact, including paper isolation from the app theme.

## Work still open

- Independently configurable question and heading treatments, numbered solved examples, style groups, and the remaining Style Studio controls.
- Lightweight image derivatives with an original-resolution print path, arbitrary crop rectangles, editable geometry points and measurements.
- Remaining template catalog, expanded derivatives chapter and its full visual print review.
- End-to-end WebKit and performance gates before promotion from preview.
