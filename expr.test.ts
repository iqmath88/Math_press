import { describe, expect, it } from "vitest";
import { compileExpr, evalNumber } from "./expr";
import { defaultGraphSpec, graphAspect, newItem, parsePoints, sanitizeSpec, validateItem, validateSpec } from "./graphSpec";

const f = (s: string, x: number) => compileExpr(s)(x);

describe("expression parser", () => {
  it("handles precedence, powers and unary minus", () => {
    expect(f("x^2-4", 3)).toBe(5);
    expect(f("-x^2", 3)).toBe(-9);
    expect(f("2^3^2", 0)).toBe(512); // يمينية الارتباط
    expect(f("2^-1", 0)).toBe(0.5);
    expect(f("(x+1)(x-1)", 3)).toBe(8);
    expect(f("10-4-3", 0)).toBe(3);
    expect(f("8/4/2", 0)).toBe(1);
  });

  it("supports implicit multiplication and constants", () => {
    expect(f("2x+1", 3)).toBe(7);
    expect(f("3(x+1)", 1)).toBe(6);
    expect(f("2pi", 0)).toBeCloseTo(2 * Math.PI);
    expect(f("x sin(x)", Math.PI / 2)).toBeCloseTo(Math.PI / 2);
  });

  it("evaluates functions", () => {
    expect(f("sin(x)", Math.PI / 6)).toBeCloseTo(0.5);
    expect(f("sqrt(x)", 16)).toBe(4);
    expect(f("abs(x)", -3)).toBe(3);
    expect(f("ln(e)", 0)).toBeCloseTo(1);
    expect(f("log(x)", 1000)).toBeCloseTo(3);
    expect(f("exp(0)", 0)).toBe(1);
    expect(Number.isNaN(f("sqrt(x)", -1))).toBe(true);
  });

  it("accepts y= / f(x)= prefixes and typographic symbols", () => {
    expect(f("y = x^2", 3)).toBe(9);
    expect(f("f(x)=2x", 4)).toBe(8);
    expect(f("x × 2 − 1", 3)).toBe(5);
    expect(f("٢x", 3)).toBe(6);
    expect(f("π", 0)).toBeCloseTo(Math.PI);
  });

  it("reports readable errors instead of throwing obscure ones", () => {
    expect(() => compileExpr("")).toThrow();
    expect(() => compileExpr("x^")).toThrow();
    expect(() => compileExpr("(x+1")).toThrow(/قوس/);
    expect(() => compileExpr("foo(x)")).toThrow(/غير معروف/);
    expect(() => compileExpr("sin x")).toThrow(/قوسين/);
    expect(() => compileExpr("x$2")).toThrow(/غير مدعوم/);
  });

  it("does not execute code", () => {
    expect(() => compileExpr("alert(1)")).toThrow();
    expect(() => compileExpr("constructor")).toThrow();
    expect(() => compileExpr("__proto__")).toThrow();
  });

  it("evalNumber evaluates constants but rejects x", () => {
    expect(evalNumber("sqrt(2)/2")).toBeCloseTo(0.7071, 3);
    expect(evalNumber("3pi")).toBeCloseTo(3 * Math.PI);
    expect(() => evalNumber("x+1")).toThrow();
    expect(() => evalNumber("1/0")).toThrow();
  });
});

describe("graph spec helpers", () => {
  it("parses named and unnamed points, including nested expressions", () => {
    expect(parsePoints("A(0,0) B(4,0) C(0,3)")).toEqual([
      { name: "A", x: 0, y: 0 }, { name: "B", x: 4, y: 0 }, { name: "C", x: 0, y: 3 }
    ]);
    const p = parsePoints("(sqrt(4), -1) أ(1.5،2)");
    expect(p[0]).toEqual({ name: "", x: 2, y: -1 });
    expect(p[1]).toEqual({ name: "أ", x: 1.5, y: 2 });
    expect(parsePoints("")).toEqual([]);
  });

  it("rejects malformed points", () => {
    expect(() => parsePoints("A 1,2")).toThrow();
    expect(() => parsePoints("A(1)")).toThrow(/إحداثيين/);
    expect(() => parsePoints("A(1,2")).toThrow(/قوس/);
  });

  it("validates every item type", () => {
    for (const type of ["function", "points", "segment", "line", "polygon", "circle", "angle", "text"] as const) {
      expect(validateItem(newItem(type))).toBeNull();
    }
    const seg = newItem("segment");
    expect(validateItem({ ...seg, pts: "A(0,0)" } as typeof seg)).toMatch(/نقطتين/);
    const fn = newItem("function");
    expect(validateItem({ ...fn, expr: "x^^" } as typeof fn)).not.toBeNull();
    const c = newItem("circle");
    expect(validateItem({ ...c, radius: "-1" } as typeof c)).toMatch(/موجبًا/);
  });

  it("validates ranges and computes aspect ratio", () => {
    const s = defaultGraphSpec();
    expect(validateSpec(s)).toBeNull();
    expect(validateSpec({ ...s, xmax: -9 })).toMatch(/x/);
    expect(graphAspect(s)).toBe(1);
    expect(graphAspect({ ...s, xmin: -10, xmax: 10, ymin: -2, ymax: 2 })).toBe(4);
    expect(graphAspect({ ...s, equal: false })).toBeCloseTo(4 / 3);
  });

  it("sanitizes damaged stored specs", () => {
    expect(sanitizeSpec(null).items.length).toBe(1);
    const s = sanitizeSpec({ xmin: "a", widthPct: 900, items: [null, { type: "function", expr: "x" }] });
    expect(s.xmin).toBe(-5);
    expect(s.widthPct).toBe(100);
    expect(s.items.length).toBe(1);
  });
});
