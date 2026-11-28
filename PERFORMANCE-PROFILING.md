# Alpha.3 conversion profile

Browser: Chromium on Linux, headless, 1440×1000. Reference: v0.6.1-rc.2. Compared the local alpha.2 build and alpha.3 on the same host. The elapsed benchmark opens the same Arabic fixture with explicit page breaks, alternates candidate order, warms up twice and measures the dollar-delimiter conversion 20 times per size. Time includes keyboard automation and waiting for the resulting math node.

| pages | build | median ms | P95 ms | min–max ms |
| ---: | --- | ---: | ---: | ---: |
| 10 | rc.2 | 21.38 | 37.74 | 10.71–62.50 |
| 10 | alpha.2 | 47.25 | 70.47 | 13.17–71.17 |
| 10 | alpha.3 | 42.09 | 61.78 | 17.09–109.35 |
| 50 | rc.2 | 46.89 | 72.89 | 18.93–77.99 |
| 50 | alpha.2 | 54.29 | 77.29 | 25.97–80.03 |
| 50 | alpha.3 | 50.21 | 79.18 | 27.50–89.26 |
| 100 | rc.2 | 68.28 | 86.68 | 26.55–126.05 |
| 100 | alpha.2 | 54.95 | 94.61 | 33.02–124.98 |
| 100 | alpha.3 | 77.58 | 106.47 | 41.63–126.60 |

## CDP trace on a 50-page fixture

A separate 12-cycle trace brackets each conversion through two animation frames. There are three document transactions per cycle across setup and conversion. Median sums per marked window:

| build | EventDispatch | UpdateLayoutTree | Layout | Paint | page transactions per 12 cycles |
| --- | ---: | ---: | ---: | ---: | ---: |
| rc.2 | 30.45 ms | 2.43 ms | 2.59 ms | 0.84 ms | 24 |
| alpha.2 | 48.93 ms | 7.19 ms | 3.11 ms | 1.74 ms | 24 |
| alpha.3 | 51.28 ms | 7.63 ms | 3.49 ms | 1.65 ms | 3 |

Trace events can nest, so the columns cannot be added to estimate latency. The local probe is `node experiments/profileConversion.cjs URL1 URL2 URL3` with optional `MATHPRESS_QA_OUTPUT` and `MATHPRESS_CHROMIUM`. Trace JSON files can be loaded by Chromium DevTools.

A confirmed source of unnecessary work was a pagination-signature reset for every document transaction. Even when mapping preserved every widget and the break plan had the same dimensions, the next frame issued a pagination transaction, which also notified the toolbar. Alpha.3 checks the measured break plan and the positions of every mapped widget. It skips only an exact match. It still measures and recalculates on real changes. Toolbar-only refresh skips transactions that change neither content, selection nor stored marks.

The largest alpha.2 Layout stack in the three-build trace passed through MathLive's `connectedCallback`; a corresponding stack in alpha.3 reached MathLive's `userSelect` getter. All builds attached exactly one new MathLive field per conversion. Style-tree work remained higher than rc.2 after the pagination fix, so the remaining latency has not been attributed to a single cause. The fixture contains plain paragraphs and manual breaks, with galleries closed and no watermarks, tables, images or box styling. This exercise does not establish React commit, autosave, or layout costs for those features.

The 15% gate is still open. Alpha.3 P95 is +63.7%, +8.6%, and +22.8% versus rc.2 at 10, 50 and 100 pages. The next step is to isolate MathLive mount/style work with unminified stacks and distinguish broader browser scheduling and frame jitter from editor commits. P1–P4 stay deferred.

## Alpha.4 print checkpoint

The editor-side pagination optimization is carried forward. Repeated the elapsed conversion benchmark with 20 measured rounds per size, on the same host, using rc.2, the alpha.3 checkpoint and the alpha.4 print build. Values are median / P95 in milliseconds.

| Pages | rc.2 | alpha.3 | alpha.4 | alpha.4 P95 vs rc.2 |
| ---: | ---: | ---: | ---: | ---: |
| 10 | 28.61 / 42.96 | 30.08 / 46.52 | 30.49 / 53.77 | +25.2% |
| 50 | 40.85 / 82.09 | 45.00 / 70.14 | 44.10 / 129.11 | +57.3% |
| 100 | 67.47 / 92.16 | 47.25 / 76.34 | 67.32 / 108.28 | +17.5% |

This session does not establish a new root cause. The changes exercised printing and document settings; the benchmark leaves print closed. Alpha.4 does not clear the 15% gate. Investigate browser scheduling separately from the MathLive mount and application work using the earlier CDP probe.

## Alpha.5 warm conversion checkpoint

The same Chromium host measured the final dollar keystroke through the appearance
of a math node. Each document has four short Arabic paragraphs per page, explicit
page breaks, and no frontmost sidebar or print preview. Each build took two
warm-up rounds and 20 alternating measured rounds at each size. Values are
median / P95 (minimum–maximum) in milliseconds.

| Pages | v0.6.1-rc.2 | alpha.4 | alpha.5 print/media checkpoint | alpha.5 P95 change |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 21.25 / 43.48 (11.11–44.44) | 27.18 / 57.70 (12.80–101.09) | 26.54 / 46.83 (12.54–66.97) | +3.34 ms (+7.7%) |
| 10 | 18.55 / 43.28 (10.76–60.04) | 34.45 / 55.69 (17.80–65.37) | 35.63 / 60.09 (12.56–63.42) | +16.81 ms (+38.8%) |
| 50 | 37.02 / 87.85 (11.98–89.06) | 40.38 / 62.43 (21.14–81.70) | 50.27 / 112.74 (23.42–176.40) | +24.90 ms (+28.3%) |
| 100 | 63.17 / 93.61 (17.22–94.61) | 54.11 / 75.17 (27.33–80.52) | 53.71 / 87.21 (20.95–90.34) | −6.40 ms (−6.8%) |
| 200 | 62.35 / 90.70 (51.95–101.36) | 82.23 / 100.48 (67.21–106.79) | 78.82 / 115.12 (59.44–123.75) | +24.41 ms (+26.9%) |

A separate Chrome DevTools Protocol trace used 12 conversions on 50 pages.
Median sums within each conversion window are below. Trace intervals can nest.

| Build | EventDispatch | UpdateLayoutTree | Layout | Paint | Pagination transactions |
| --- | ---: | ---: | ---: | ---: | ---: |
| v0.6.1-rc.2 | 31.32 ms | 2.24 ms | 2.53 ms | 0.85 ms | 24 |
| alpha.4 | 47.14 ms | 7.21 ms | 2.84 ms | 1.69 ms | 3 |
| alpha.5 | 47.44 ms | 6.92 ms | 2.89 ms | 1.70 ms | 3 |

All three builds mounted one MathLive field per conversion. Forced layout stacks
passed through its custom-element connection, including on the reference. The
alpha builds spend more time in event dispatch and style updates on the plain
document fixture. The 24-to-3 reduction in redundant pagination transactions is
preserved. These traces do not isolate which style rules or listeners explain the
remaining difference. The large difference between alpha.4 and alpha.5 P95 at
50 pages, despite near-identical trace medians, needs a controlled scheduling and
outlier investigation. The performance gate is open. Cold starts, other user
paths, memory retention, and component-by-component isolation are still pending.
