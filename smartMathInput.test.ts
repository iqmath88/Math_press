import { describe, expect, it } from "vitest";
import { delimitedMath } from "./SmartMathInput";

describe("smart math delimiters", () => {
  it("pairs delimiters by width and preserves UTF-16 offsets", () => {
    expect(delimitedMath("🧮 $C(h,k)$ و $$x^2=4$$")).toEqual([
      { from: 3, to: 11, latex: "C(h,k)", block: false },
      { from: 14, to: 23, latex: "x^2=4", block: true }
    ]);
  });

  it.each([
    "$", "$$", "$$$$", "$x", "$$x$", "$x$$", "$50 and $60", "$50,000.00$", "$10.50",
    String.raw`\$x\$`, "$x\ny$", "$x\uFFFCy$", String.raw`$\frac{x$`
  ])("keeps %s as literal text", value => {
    expect(delimitedMath(value)).toEqual([]);
  });

  it("keeps escaped currency alongside math", () => {
    expect(delimitedMath(String.raw`\$12.50 و $x^2$`).map(match => match.latex)).toEqual(["x^2"]);
  });
});
