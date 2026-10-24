import { describe, expect, it } from "vitest";
import { createDocument, validateDocument } from "./document";

describe("MathPress document schema", () => {
  it("creates a valid editable A4 document", () => {
    const doc = createDocument("اختبار");
    expect(validateDocument(doc)).toBe(true);
    expect(doc.page.size).toBe("A4");
    expect(doc.content.some(block => block.type === "math")).toBe(true);
  });

  it("rejects documents with unknown format", () => {
    expect(validateDocument({ format: "other", schemaVersion: 1, content: [] })).toBe(false);
  });
});