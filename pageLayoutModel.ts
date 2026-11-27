/** A source address refers to the unchanged editor tree, even when rendering splits a block. */
export type PageSource = { block: number; offset: number };

export type PageRange = { start: PageSource; end: PageSource };

export function comparePageSource(a: PageSource, b: PageSource): number {
  return a.block - b.block || a.offset - b.offset;
}

/** The latest start at or before a cursor. Page numbers are one-based. */
export function pageAt<T>(starts: readonly T[], cursor: T, compare: (a: T, b: T) => number): number {
  let start = 0;
  let end = starts.length;
  while (start < end) {
    const middle = (start + end) >>> 1;
    if (compare(starts[middle], cursor) <= 0) start = middle + 1;
    else end = middle;
  }
  return Math.max(1, start);
}

export function rangeOfPage(pieces: readonly PageRange[]): PageRange | null {
  return pieces.length ? { start: pieces[0].start, end: pieces[pieces.length - 1].end } : null;
}

export function rangesAtBlockStarts(starts: readonly number[], blockCount: number): PageRange[] {
  return starts.map((block, index) => ({
    start: { block, offset: 0 },
    end: { block: starts[index + 1] ?? blockCount, offset: 0 }
  }));
}
