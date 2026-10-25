// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { buildExtensions } from "./extensions";
import { starterContent } from "./document";

let editor: Editor | null = null;
let host: HTMLElement;

function make(content: any = starterContent()) {
  host = document.createElement("div");
  document.body.appendChild(host);
  editor = new Editor({ element: host, extensions: buildExtensions(), content });
  return editor;
}

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => {
  editor?.destroy();
  editor = null;
  host?.remove();
});

describe("editor schema", () => {
  it("loads the starter document and keeps inline and block equations", () => {
    const ed = make();
    const json = ed.getJSON();
    const kinds = JSON.stringify(json);
    expect(kinds).toContain("mathInline");
    expect(kinds).toContain("mathBlock");
    expect(kinds).toContain("f(x)=x^2-4");
  });

  it("inserts inline and block equations with commands", () => {
    const ed = make({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "نص" }] }] });
    ed.commands.focus("end");
    expect(ed.commands.insertMathInline("a^2+b^2=c^2", false)).toBe(true);
    expect(ed.commands.insertMathBlock("\\int_0^1 x\\,dx", false)).toBe(true);
    const s = JSON.stringify(ed.getJSON());
    expect(s).toContain("a^2+b^2=c^2");
    expect(s).toContain("\\\\int_0^1 x\\\\,dx");
    // يجب أن يبقى مكان للكتابة بعد المعادلة الكتلية الأخيرة
    const last = ed.getJSON().content!.at(-1)!;
    expect(["paragraph", "heading"]).toContain(last.type);
  });

  it("round-trips equations through HTML", () => {
    const ed = make();
    const html = ed.getHTML();
    expect(html).toContain('data-latex="x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}"');
    ed.commands.setContent(html);
    expect(JSON.stringify(ed.getJSON())).toContain("mathBlock");
  });

  it("supports tables, direction and font size", () => {
    const ed = make({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "مرحبا" }] }] });
    ed.commands.selectAll();
    expect(ed.chain().setDirection("ltr").run()).toBe(true);
    expect(ed.chain().setFontSize("20").run()).toBe(true);
    expect(ed.getHTML()).toContain('dir="ltr"');
    expect(ed.getHTML()).toMatch(/font-size:\s*20pt/);
    expect(ed.chain().focus("end").insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run()).toBe(true);
    expect(JSON.stringify(ed.getJSON())).toContain("tableHeader");
  });

  it("supports manual page breaks and images with width", () => {
    const ed = make();
    expect(ed.commands.insertPageBreak()).toBe(true);
    expect(ed.chain().focus("end").setImage({ src: "data:image/gif;base64,R0lGODlhAQABAAAAACw=" }).run()).toBe(true);
    ed.commands.updateAttributes("image", { width: "50%" });
    const s = JSON.stringify(ed.getJSON());
    expect(s).toContain("pageBreak");
    expect(s).toContain("50%");
  });
});

describe("pagination plugin", () => {
  it("splits content into A4 pages and adds a footer for each page", async () => {
    // كل كتلة بارتفاع 300px؛ المتاح للمحتوى ≈ 971px فتتسع 3 كتل في الصفحة.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      height: 300, width: 600, top: 0, left: 0, right: 600, bottom: 300, x: 0, y: 0, toJSON: () => ({})
    } as DOMRect);
    const paragraphs = Array.from({ length: 7 }, (_, i) => ({
      type: "paragraph", content: [{ type: "text", text: `فقرة ${i}` }]
    }));
    const ed = make({ type: "doc", content: paragraphs });
    ed.storage.footerText = "ملزمة";
    await new Promise(r => setTimeout(r, 120));

    expect(ed.storage.pagination.pages).toBe(3);
    const breaks = host.querySelectorAll(".pg-break");
    expect(breaks.length).toBe(3); // فاصلان + تذييل الصفحة الأخيرة
    expect(host.querySelectorAll(".pg-break.pg-last").length).toBe(1);
    expect(host.textContent).toContain("صفحة 1 من 3");
    expect(host.textContent).toContain("صفحة 3 من 3");

    // الاستقرار: إعادة القياس لا تغيّر عدد الفواصل
    ed.commands.repaginate();
    await new Promise(r => setTimeout(r, 120));
    expect(host.querySelectorAll(".pg-break").length).toBe(3);
  });

  it("keeps decorations aligned after typing earlier in the document", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      height: 300, width: 600, top: 0, left: 0, right: 600, bottom: 300, x: 0, y: 0, toJSON: () => ({})
    } as DOMRect);
    const paragraphs = Array.from({ length: 4 }, (_, i) => ({
      type: "paragraph", content: [{ type: "text", text: `فقرة ${i}` }]
    }));
    const ed = make({ type: "doc", content: paragraphs });
    await new Promise(r => setTimeout(r, 120));
    expect(ed.storage.pagination.pages).toBe(2);
    ed.commands.insertContentAt(1, "أضفت كلمة ");
    await new Promise(r => setTimeout(r, 120));
    expect(host.querySelectorAll(".pg-break").length).toBe(2);
    expect(ed.storage.pagination.pages).toBe(2);
  });
});

describe("formatting removal", () => {
  it("removes highlight and text color from the selection", () => {
    const ed = make({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "نص ملوّن" }] }] });
    ed.commands.selectAll();
    ed.chain().setHighlight({ color: "#ffff00" }).setColor("#ff0000").run();
    expect(ed.getHTML()).toContain("<mark");
    expect(ed.getHTML()).toContain("color");
    ed.chain().unsetHighlight().run();
    expect(ed.getHTML()).not.toContain("<mark");
    ed.chain().unsetColor().run();
    expect(ed.getHTML()).not.toContain("color:");
    ed.chain().setHighlight({ color: "#ffff00" }).setBold().run();
    ed.chain().unsetAllMarks().run();
    expect(ed.getHTML()).not.toMatch(/<mark|<strong/);
  });
});

describe("graphs, columns and page layout", () => {
  it("gives every editor its own pagination storage", () => {
    const a = make();
    a.storage.pagination.footerText = "تذييل أ";
    a.storage.pagination.layout = { ...a.storage.pagination.layout, pageHeightMm: 210 };
    const hostA = host;
    const b = make();
    expect(b.storage.pagination.footerText).toBe("");
    expect(b.storage.pagination.layout.pageHeightMm).toBe(297);
    b.destroy();
    a.destroy();
    hostA.remove();
    editor = null;
  });

  const stubRect = (h: number) =>
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      height: h, width: 600, top: 0, left: 0, right: 600, bottom: h, x: 0, y: 0, toJSON: () => ({})
    } as DOMRect);

  it("inserts a graph, keeps its spec through HTML round-trips and leaves room to type after it", async () => {
    const { defaultGraphSpec, newItem } = await import("./graphSpec");
    const spec = { ...defaultGraphSpec(), caption: "الشكل 1", items: [newItem("function"), newItem("circle")] };
    const ed = make({ type: "doc", content: [{ type: "paragraph" }] });
    expect(ed.commands.insertGraph(spec)).toBe(true);
    const node = ed.getJSON().content!.find(n => n.type === "graph")!;
    expect(node.attrs!.spec.caption).toBe("الشكل 1");
    expect(node.attrs!.spec.items.length).toBe(2);
    expect(ed.getJSON().content!.at(-1)!.type).toBe("paragraph");
    const html = ed.getHTML();
    expect(html).toContain("data-graph");
    ed.commands.setContent(html);
    const again = ed.getJSON().content!.find(n => n.type === "graph")!;
    expect(again.attrs!.spec.items[1].type).toBe("circle");
  });

  it("inserts two-column blocks, never nests them, and can delete them", () => {
    const ed = make({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "قبل" }] }] });
    ed.commands.focus("end");
    expect(ed.commands.insertColumns()).toBe(true);
    const cols = ed.getJSON().content!.find(n => n.type === "columns")!;
    expect(cols.content!.length).toBe(2);
    expect(cols.content!.every(c => c.type === "column")).toBe(true);

    // محاولة إدراج أعمدة داخل عمود يجب ألا تنتج تداخلًا
    ed.commands.setTextSelection(ed.state.doc.content.size - 4);
    ed.commands.insertColumns();
    const nested = (n: any, inside = false): boolean =>
      n.type === "columns" ? inside || (n.content ?? []).some((c: any) => nested(c, true)) : (n.content ?? []).some((c: any) => nested(c, inside));
    expect(nested(ed.getJSON())).toBe(false);

    let colsPos = -1;
    ed.state.doc.forEach((n, offset) => { if (colsPos < 0 && n.type.name === "columns") colsPos = offset; });
    ed.commands.setTextSelection(colsPos + 3); // داخل أول فقرة في أول عمود
    expect(ed.isActive("columns")).toBe(true);
    const before = ed.getJSON().content!.filter(n => n.type === "columns").length;
    ed.commands.deleteColumns();
    expect(ed.getJSON().content!.filter(n => n.type === "columns").length).toBeLessThan(before);
    expect(ed.getJSON().content!.length).toBeGreaterThan(0);
  });

  it("rejects page breaks inside a column", () => {
    const ed = make({
      type: "doc",
      content: [{ type: "columns", content: [
        { type: "column", content: [{ type: "paragraph", content: [{ type: "text", text: "أ" }] }] },
        { type: "column", content: [{ type: "paragraph" }] }
      ] }]
    });
    ed.commands.setTextSelection(4);
    ed.commands.insertPageBreak();
    const json = JSON.stringify(ed.getJSON().content![0]);
    expect(json).not.toContain("pageBreak");
  });

  it("repaginates for landscape pages and shows header and footer text", async () => {
    stubRect(300);
    const paragraphs = Array.from({ length: 6 }, (_, i) => ({ type: "paragraph", content: [{ type: "text", text: `فقرة ${i}` }] }));
    const ed = make({ type: "doc", content: paragraphs });
    await new Promise(r => setTimeout(r, 120));
    expect(ed.storage.pagination.pages).toBe(2); // عمودي: 3 كتل في الصفحة

    ed.storage.pagination.footerText = "ملزمة الفصل الأول";
    ed.storage.pagination.layout = {
      pageHeightMm: 210, marginTopMm: 20, marginBottomMm: 20, headerText: "ثانوية النور", showPageNumbers: true
    };
    ed.commands.repaginate();
    await new Promise(r => setTimeout(r, 120));
    expect(ed.storage.pagination.pages).toBe(3); // أفقي: كتلتان في الصفحة
    expect(host.textContent).toContain("ثانوية النور");
    expect(host.textContent).toContain("ملزمة الفصل الأول");
    expect(host.textContent).toContain("صفحة 3 من 3");

    ed.storage.pagination.layout = { ...ed.storage.pagination.layout, showPageNumbers: false, headerText: "" };
    ed.commands.repaginate();
    await new Promise(r => setTimeout(r, 120));
    expect(host.textContent).not.toContain("صفحة 1 من");
  });

  it("treats a columns block as one unbreakable block when paginating", async () => {
    stubRect(400);
    const cols = {
      type: "columns", content: [
        { type: "column", content: [{ type: "paragraph", content: [{ type: "text", text: "س1" }] }] },
        { type: "column", content: [{ type: "paragraph", content: [{ type: "text", text: "س2" }] }] }
      ]
    };
    const ed = make({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "مقدمة" }] }, cols, cols, cols] });
    await new Promise(r => setTimeout(r, 120));
    // 4 كتل + الفقرة الختامية التي تُضاف بعد آخر كتلة غير نصية = 5 × 400px، ويتسع 2 في الصفحة (المتاح ≈ 971px)
    expect(ed.getJSON().content!.length).toBe(5);
    expect(ed.storage.pagination.pages).toBe(3);
  });
});
