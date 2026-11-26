// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { findDocumentMatches, replaceMatches, searchKey, updateSearch } from "./DocumentSearch";
import { applyEducationalStyle, defaultEducationalStyles, readEducationalStyles, resolveEducationalStyles } from "./educationalStyles";
import { createDocument, parseDocument } from "./document";
import { buildExtensions } from "./extensions";
import { validateImportedContent } from "./importValidation";
import { readParagraphFormat } from "./ParagraphFormat";
import { computeBreaks } from "./paginate";

describe("document editing engine", () => {
  it("finds Arabic and case-insensitive Latin text across marks, and keeps equations intact", () => {
    const editor = new Editor({
      extensions: buildExtensions(),
      content: { type: "doc", content: [
        { type: "paragraph", content: [
          { type: "text", text: "السؤال (Ex" },
          { type: "text", text: "Ample)", marks: [{ type: "bold" }] },
          { type: "mathInline", attrs: { latex: "(example)+(example)" } },
          { type: "text", text: "السؤال" }
        ] },
        { type: "mathBlock", attrs: { latex: "(example)" } }
      ] }
    });
    try {
      expect(findDocumentMatches(editor.state.doc, { query: "السؤال", includeLatex: false })).toHaveLength(2);
      const options = { query: "(example)", includeLatex: true };
      updateSearch(editor, options);
      const result = searchKey.getState(editor.state);
      expect(result?.matches).toHaveLength(4);
      expect(result?.decorations.find()).toHaveLength(3);
      replaceMatches(editor, result?.matches ?? [], "مثال");
      expect(editor.getText()).toContain("السؤال مثال");
      expect(searchKey.getState(editor.state)?.matches.every(match => match.latex)).toBe(true);
      expect(editor.commands.undo()).toBe(true);
      expect(searchKey.getState(editor.state)?.matches).toHaveLength(4);
    } finally { editor.destroy(); }
  });

  it("stores educational style references on selected blocks and preserves marks", () => {
    const editor = new Editor({ extensions: buildExtensions(), content: "<p><strong>سؤال</strong></p><p>حل</p>" });
    try {
      editor.commands.selectAll();
      applyEducationalStyle(editor, "question");
      const blocks = editor.getJSON().content ?? [];
      expect(blocks.map(block => block.attrs?.educationalStyle)).toEqual(["question", "question"]);
      expect(blocks[0].content?.[0].marks).toEqual([{ type: "bold" }]);
      expect(editor.getHTML()).toContain('data-educational-style="question"');
      editor.commands.undo();
      expect(editor.getJSON().content?.[0].attrs?.educationalStyle).toBeNull();
    } finally { editor.destroy(); }
  });

  it("keeps style overrides in the saved document and constrains imported values", () => {
    const base = defaultEducationalStyles.find(style => style.id === "question")!;
    const overrides = readEducationalStyles([
      { ...base, name: "سؤال مخصص", color: "#112233" },
      { ...base, id: "custom-safe", color: "red!important", size: 200 },
      { ...base, id: 'bad"selector' }
    ]);
    expect(overrides).toHaveLength(2);
    expect(overrides[1].size).toBe(14);
    expect(overrides[1].color).toBe("#161616");
    const parsed = parseDocument({ ...createDocument(), educationalStyles: overrides });
    expect(resolveEducationalStyles(parsed?.educationalStyles)).toHaveLength(17);
    expect(resolveEducationalStyles(parsed?.educationalStyles).find(style => style.id === "question")?.color).toBe("#112233");
  });

  it("validates imported document structure and keeps safe mathematical content", () => {
    const original = createDocument().content;
    expect(validateImportedContent(original)?.content?.some(node => node.type === "mathBlock")).toBe(true);
    expect(validateImportedContent({ type: "doc", content: [{ type: "unsupported" }] })).toBeNull();
    expect(validateImportedContent({ type: "doc", content: [
      { type: "paragraph", content: [{ type: "table" }] }
    ] })).toBeNull();
    expect(validateImportedContent({ type: "doc", content: [
      { type: "image", attrs: { src: "unsupported:asset" } }
    ] })).toBeNull();
    const input = { type: "doc", content: [{ type: "paragraph", content: [
      { type: "text", text: "نص", marks: [{ type: "textStyle", attrs: { fontSize: "14;invalid", color: "#223344" } }] }
    ] }] };
    const mark = validateImportedContent(input)?.content?.[0].content?.[0].marks?.[0];
    expect(mark?.attrs).toMatchObject({ fontSize: null, color: "#223344" });
  });

  it("constrains standalone paragraph formatting to supported rendering values", () => {
    expect(readParagraphFormat({ lineHeight: 1.4, indent: 12, hanging: 7, keepWithNext: true, widows: false,
      before: -2, background: "invalid", border: "#334455" })).toEqual({
      lineHeight: 1.4, indent: 12, hanging: 7, keepWithNext: true, widows: false, border: "#334455"
    });
  });

  it("keeps a title with the next block and does not create an empty opening page", () => {
    expect(computeBreaks([
      { height: 60, breakBefore: true }, { height: 20, keepWithNext: true }, { height: 40 }
    ], 100).breaks).toEqual([{ index: 1, filler: 40 }]);
    expect(computeBreaks([
      { height: 30 }, { height: 30, breakBefore: true }, { height: 30 }
    ], 100).pages).toBe(2);
  });
});
