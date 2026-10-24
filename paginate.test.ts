import { describe, expect, it } from "vitest";
import { computeBreaks } from "./paginate";

const items = (...hs: number[]) => hs.map(height => ({ height }));

describe("computeBreaks", () => {
  it("keeps everything on one page when it fits", () => {
    const r = computeBreaks(items(100, 200, 300), 1000);
    expect(r.pages).toBe(1);
    expect(r.breaks).toEqual([]);
    expect(r.lastFiller).toBe(400);
  });

  it("moves a block that does not fit to the next page", () => {
    const r = computeBreaks(items(400, 400, 400), 1000);
    expect(r.pages).toBe(2);
    expect(r.breaks).toEqual([{ index: 2, filler: 200 }]);
    expect(r.lastFiller).toBe(600);
  });

  it("allows a block that exactly fills the page", () => {
    const r = computeBreaks(items(500, 500, 10), 1000);
    expect(r.breaks).toEqual([{ index: 2, filler: 0 }]);
    expect(r.pages).toBe(2);
  });

  it("honours manual page breaks", () => {
    const r = computeBreaks([{ height: 100 }, { height: 0, breakAfter: true }, { height: 100 }], 1000);
    expect(r.pages).toBe(2);
    expect(r.breaks).toEqual([{ index: 2, filler: 900 }]);
  });

  it("does not add a second break when a manual break lands on a natural one", () => {
    const r = computeBreaks([{ height: 900 }, { height: 0, breakAfter: true }, { height: 300 }], 1000);
    expect(r.breaks.length).toBe(1);
    expect(r.pages).toBe(2);
  });

  it("lets an oversized block span pages without splitting it", () => {
    const r = computeBreaks(items(100, 2500, 100), 1000);
    expect(r.breaks[0]).toEqual({ index: 1, filler: 900 });
    expect(r.pages).toBe(4);
  });

  it("handles empty input and invalid page height", () => {
    expect(computeBreaks([], 1000).pages).toBe(1);
    expect(computeBreaks(items(10, 10), 0).breaks).toEqual([]);
  });
});
