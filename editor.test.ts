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
  editor = new Editor({ element: host, extensions: buildExtensions({ marginTopMm: 20, marginBottomMm: 20 }), content });
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
