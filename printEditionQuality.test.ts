import { describe, expect, it } from "vitest";
import { canvasPixelLimit, pagePixels, printTileEdge, printTiles } from "./printEditionQuality";

describe("physical PDF raster resolution", () => {
  it.each([
    [150, 1240, 1754], [216, 1786, 2526], [300, 2480, 3508], [450, 3720, 5262], [600, 4961, 7016],
  ])("renders A4 at %d DPI", (dpi, width, height) => {
    expect(pagePixels(210, 297, dpi)).toEqual({ width, height });
    expect(pagePixels(297, 210, dpi)).toEqual({ width: height, height: width });
  });

  it("covers A4 at 600 DPI with bounded overlapping tiles on touch Apple devices", () => {
    const { width, height } = pagePixels(210, 297, 600);
    const limit = canvasPixelLimit({ userAgent: "Macintosh", maxTouchPoints: 5 });
    const edge = printTileEdge(width, height, 600, limit);
    const tiles = [...printTiles(width, height, edge)];
    expect(edge).toBe(1024);
    expect(tiles.length).toBe(35);
    expect(tiles.reduce((sum, t) => sum + (t.right - t.left) * (t.bottom - t.top), 0))
      .toBe(width * height);
    for (const t of tiles) {
      expect(t.width).toBeLessThanOrEqual(1040);
      expect(t.height).toBeLessThanOrEqual(1040);
      expect(t.x).toBeLessThanOrEqual(t.left);
      expect(t.y).toBeLessThanOrEqual(t.top);
      expect(t.x + t.width).toBeGreaterThanOrEqual(t.right);
      expect(t.y + t.height).toBeGreaterThanOrEqual(t.bottom);
    }
  });

  it("uses 512-pixel tiles when a browser reports two GiB of device memory", () => {
    const limit = canvasPixelLimit({ userAgent: "Desktop", maxTouchPoints: 0, deviceMemory: 2 });
    expect(printTileEdge(4961, 7016, 600, limit)).toBe(512);
  });
});
