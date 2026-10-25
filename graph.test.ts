// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import { drawItems, loadJXG } from "./graph";
import { defaultGraphSpec, newItem, type GraphSpec } from "./graphSpec";

let JXG: any;

beforeAll(async () => {
  (window as any).matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  (window as any).IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  (window as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 400 });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 400 });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 400 });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 400 });
  (SVGElement.prototype as any).getBBox = () => ({ x: 0, y: 0, width: 10, height: 10 });
  (SVGElement.prototype as any).getComputedTextLength = () => 10;
  JXG = await loadJXG();
});

function board(spec: GraphSpec) {
  const box = document.createElement("div");
  box.id = `t${Math.random().toString(36).slice(2)}`;
  document.body.appendChild(box);
  return JXG.JSXGraph.initBoard(box.id, {
    boundingbox: [spec.xmin, spec.ymax, spec.xmax, spec.ymin],
    axis: spec.axes, grid: spec.grid, showCopyright: false, showNavigation: false,
    pan: { enabled: false }, zoom: { enabled: false }, renderer: "svg"
  });
}

describe("JSXGraph rendering (smoke)", () => {
  it("draws every item type without errors", () => {
    const spec: GraphSpec = {
      ...defaultGraphSpec(),
      items: (["function", "points", "segment", "line", "polygon", "circle", "angle", "text"] as const).map((t, i) => newItem(t, i))
    };
    const b = board(spec);
    expect(drawItems(b, spec)).toEqual([]);
    expect(b.containerObj.querySelector("svg")).not.toBeNull();
    JXG.JSXGraph.freeBoard(b);
  });

  it("reports an error for a bad item but still draws the others", () => {
    const spec: GraphSpec = { ...defaultGraphSpec(), items: [{ ...newItem("function"), expr: "x^^" } as any, newItem("circle")] };
    const b = board(spec);
    const errors = drawItems(b, spec);
    expect(errors.length).toBe(1);
    expect(b.containerObj.querySelectorAll("path,circle,ellipse").length).toBeGreaterThan(0);
    JXG.JSXGraph.freeBoard(b);
  });

  it("measures the smaller angle regardless of the order of the points", () => {
    const measure = (pts: string) => {
      const spec: GraphSpec = { ...defaultGraphSpec(), items: [{ ...newItem("angle"), pts } as any] };
      const b = board(spec);
      drawItems(b, spec);
      const angle = Object.values(b.objects).find((o: any) => o.elType === "angle") as any;
      const v = angle.Value();
      JXG.JSXGraph.freeBoard(b);
      return v;
    };
    // 45° بكلا الترتيبين
    expect(measure("A(3,0) B(0,0) C(2,2)")).toBeCloseTo(Math.PI / 4, 3);
    expect(measure("C(2,2) B(0,0) A(3,0)")).toBeCloseTo(Math.PI / 4, 3);
    // 90°
    expect(measure("A(0,3) B(0,0) C(3,0)")).toBeCloseTo(Math.PI / 2, 3);
  });
});
