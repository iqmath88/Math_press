# Glass Creative Studio rc.1 follow-up

The working branch is `feature/v0.7.0-creative-studio`, tracked by draft PR #15. Start from the latest commit on that branch and compare against preview.3 commit `158e5d5caa29fdfaddf71e00229812b8be21df24`.

## Verification gates

- Run the focused equation-close benchmark against rc.2 with 10, 50 and 100 page fixtures, 20 measured rounds per size, and a quiet browser host. The gate is a maximum 15% P95 regression under equivalent conditions. Keep historical measurements distinct from contemporaneous results.
- Follow the image import diagnostic in `creative.e2e.cjs` on standalone WebKit. Verify native clipboard paste, file selection, empty MIME, backup restore, IndexedDB and offline operation. Keep the 30-round editing history check unchanged. A prior run already failed on the history check before reaching the image scenario.
- Use a physical iPad and Windows device before release approval. Record Safari touch behavior and native printing separately from Playwright emulation.
- Check the browser PDF and editable MathDoc samples in the print-compatibility artifact, including paper isolation from the app theme.

## Work still open

- Full-document reusable style groups, dynamic example renumbering after moves and deletions, and remaining Style Studio controls. Current example numbers are assigned at insertion and remain editable.
- Crop handles, interactive geometry construction, formula labels, and angle measurement are still open. Raster previews and original-resolution printing are implemented, along with basic dimension and point labels.
- Complete the template catalog and verify additional print fixtures. The derivatives chapter now includes a cover and a multi-step example.
- End-to-end WebKit and performance gates before promotion from preview.


## Manual release checklist

- On physical iPad Safari, choose a large image, edit its crop within a box, reopen the MathDoc offline, and print with the original image.
- On the iPad and Windows, edit a MathLive equation between Arabic words and verify the caret, Undo and Redo.
- Print the derivatives lesson and exam on A4, then repeat a page on A3 or A5. Verify margins, page numbers and grayscale readability.
- Open a MathDoc 3 or 4 backup, then export and reopen the current MathDoc 5 sample. Compare the text, images, shape annotations and page styles.

## 0.7.0 release order

Keep PR #15 as a draft until all required checks and manual acceptance are complete. PR #15 currently targets the feature branch of PR #14. Review #14 first. If it is approved for integration, preserve its commit ancestry when merging, then retarget #15 and verify that its diff contains only Creative Studio work. If #14 is integrated by squash, rebase the Studio-only range explicitly before retargeting and rerun required checks. Keep experimental page-engine PRs #10–#13 out of the release. Merge and publish only with explicit production approval.

Personal templates can be moved as MathDoc, including embedded images. A custom identity travels with a document and can also be moved independently as JSON. The RC version is retained pending browser and manual gates.
