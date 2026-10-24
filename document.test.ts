import { describe, expect, it } from "vitest";
import { createDocument, parseDocument } from "./document";

describe("MathPress document model", () => {
  it("creates a valid v2 A4 document with a block equation", () => {
    const doc = createDocument("اختبار");
    expect(doc.schemaVersion).toBe(2);
    expect(doc.page.size).toBe("A4");
    expect(parseDocument(JSON.parse(JSON.stringify(doc)))).not.toBeNull();
    expect(doc.content.content?.some(n => n.type === "mathBlock")).toBe(true);
  });

  it("rejects unknown formats and broken content", () => {
    expect(parseDocument({ format: "other", schemaVersion: 2 })).toBeNull();
    expect(parseDocument({ format: "mathpress", schemaVersion: 2, id: "a", title: "t", content: [] })).toBeNull();
    expect(parseDocument(null)).toBeNull();
    expect(parseDocument({ format: "mathpress", schemaVersion: 9, id: "a", title: "t", content: {} })).toBeNull();
  });

  it("migrates v1 documents to v2 without losing text or LaTeX", () => {
    const v1 = {
      format: "mathpress", schemaVersion: 1, id: "old-1", title: "درس قديم", language: "ar", direction: "rtl",
      page: { size: "A4", orientation: "portrait", marginsMm: { top: 20, right: 18, bottom: 20, left: 18 } },
      content: [
        { id: "a", type: "paragraph", text: "سطر أول\nسطر ثان" },
        { id: "b", type: "math", latex: "\\frac{a}{b}", display: true }
      ],
      updatedAt: "2026-01-01T00:00:00.000Z"
    };
    const out = parseDocument(v1)!;
    expect(out.schemaVersion).toBe(2);
    expect(out.id).toBe("old-1");
    const types = out.content.content!.map(n => n.type);
    expect(types).toEqual(["heading", "paragraph", "paragraph", "mathBlock"]);
    expect(out.content.content![3].attrs?.latex).toBe("\\frac{a}{b}");
    expect(out.content.content![2].content![0].text).toBe("سطر ثان");
  });

  it("falls back to default margins when they are invalid", () => {
    const doc = createDocument();
    const broken = { ...doc, page: { ...doc.page, marginsMm: { top: -5, right: 1, bottom: 1, left: 1 } } };
    expect(parseDocument(broken)!.page.marginsMm.top).toBe(20);
  });
});
