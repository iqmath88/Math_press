# Glass Creative Studio preview.4 follow-up

The working branch is `feature/v0.7.0-creative-studio`, tracked by draft PR #15. Start from the latest commit on that branch and compare against preview.3 commit `158e5d5caa29fdfaddf71e00229812b8be21df24`.

## Verification gates

- Run the focused equation-close benchmark against rc.2 with 10, 50 and 100 page fixtures, 20 measured rounds per size, and a quiet browser host. The gate is a maximum 15% P95 regression under equivalent conditions. Keep historical measurements distinct from contemporaneous results.
- Follow the image import diagnostic in `creative.e2e.cjs` on standalone WebKit. Verify native clipboard paste, file selection, empty MIME, backup restore, IndexedDB and offline operation. Keep the 30-round editing history check unchanged. A prior run already failed on the history check before reaching the image scenario.
- Use a physical iPad and Windows device before release approval. Record Safari touch behavior and native printing separately from Playwright emulation.
- Check the browser PDF and editable MathDoc samples in the print-compatibility artifact, including paper isolation from the app theme.

## Work still open

- Full-document reusable style groups, dynamic example renumbering after moves and deletions, and remaining Style Studio controls. Current example numbers are assigned at insertion and remain editable.
- Lightweight image derivatives with an original-resolution print path, arbitrary crop rectangles, editable geometry points and measurements.
- Complete the template catalog and verify additional print fixtures. The derivatives chapter now includes a cover and a multi-step example.
- End-to-end WebKit and performance gates before promotion from preview.
