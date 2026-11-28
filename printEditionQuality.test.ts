import { describe, expect, it } from "vitest";
import { canvasPixelLimit, pagePixels } from "./printEditionQuality";

describe("physical PDF raster resolution", () => {
  it.each([
    [150, 1240, 1754], [216, 1786, 2526], [300, 2480, 3508], [450, 3720, 5262], [600, 4961, 7016],
  ])("renders A4 at %d DPI", (dpi, width, height) => {
    expect(pagePixels(210, 297, dpi)).toEqual({ width, height });
    expect(pagePixels(297, 210, dpi)).toEqual({ width: height, height: width });
  });

  it("leaves high resolutions visible but enforces a lower tablet allocation budget", () => {
    const a4 = pagePixels(210, 297, 450);
    const desktop = canvasPixelLimit({ userAgent: "Macintosh", maxTouchPoints: 0 });
    const ipad = canvasPixelLimit({ userAgent: "Macintosh", maxTouchPoints: 5 });
    expect(a4.width * a4.height).toBeLessThan(desktop);
    expect(a4.width * a4.height).toBeGreaterThan(ipad);
  });
});
