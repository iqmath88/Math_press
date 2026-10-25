# MathPress 0.3.0 — Phase 1

## Implemented
- Startup recovery: loads the most recently updated valid local document when the app opens.
- Startup guard: displays a recovery state and prevents editing the title/footer until the local library read finishes.
- Save queue: serializes asynchronous writes to reduce the chance that an older write overwrites a newer edit.
- Document switching: attempts to flush the active document before creating a new document, opening a `.mathdoc` file, or opening an item from the local library.
- Library opening: reloads the selected item after flushing the active document so a stale library list entry is less likely to replace recent edits.
- Updated package and documentation version to 0.3.0.

## Verification status
- Source changes were reviewed statically.
- Automated tests and production build were **not verified** in this environment because `npm ci` did not finish before the environment timeout.
- Before deploying, run `npm ci`, `npm run test`, and `npm run build`, then complete the iPad/desktop print checks in `QA-PLAN.md`.

## Known limitations retained
- Save-on-exit cannot guarantee an asynchronous IndexedDB write completes when a browser process is forcibly terminated. The app warns while saving; users should still export backups for important work.
- Page layout/printing and splitting long tables or blocks still need the dedicated second-phase work and device testing.
