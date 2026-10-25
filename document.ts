import type { JSONContent } from "@tiptap/core";
import type { MathPressDocument, PageSettings } from "./types";

export const DEFAULT_PAGE: PageSettings = {
  size: "A4",
  orientation: "portrait",
  marginsMm: { top: 20, right: 18, bottom: 20, left: 18 }
};

export function starterContent(): JSONContent {
  return {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "عنوان الدرس" }] },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "اكتب الشرح هنا. مثال على معادلة داخل السطر: " },
          { type: "mathInline", attrs: { latex: "f(x)=x^2-4" } },
          { type: "text", text: "." }
        ]
      },
      { type: "mathBlock", attrs: { latex: "x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}" } },
      { type: "paragraph" }
    ]
  };
}

export function createDocument(title = "ملزمة رياضيات"): MathPressDocument {
  return {
    format: "mathpress",
    schemaVersion: 3,
    id: crypto.randomUUID(),
    title,
    language: "ar",
    direction: "rtl",
    page: structuredClone(DEFAULT_PAGE),
    headerText: "",
    footerText: "",
    showPageNumbers: true,
    content: starterContent(),
    updatedAt: new Date().toISOString()
  };
}

function isDocJson(value: unknown): value is JSONContent {
  if (!value || typeof value !== "object") return false;
  const v = value as { type?: unknown; content?: unknown };
  return v.type === "doc" && Array.isArray(v.content) && v.content.length > 0;
}

function textParagraph(line: string): JSONContent {
  return line ? { type: "paragraph", content: [{ type: "text", text: line }] } : { type: "paragraph" };
}

/** تحويل مستند النسخة 1 (كتل بسيطة) إلى نموذج TipTap (الإصدار الحالي). */
function migrateV1(d: Record<string, unknown>): MathPressDocument | null {
  if (!Array.isArray(d.content)) return null;
  const nodes: JSONContent[] = [];
  const title = typeof d.title === "string" ? d.title : "";
  if (title) nodes.push({ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: title }] });
  for (const raw of d.content as unknown[]) {
    if (!raw || typeof raw !== "object") continue;
    const block = raw as { type?: unknown; text?: unknown; latex?: unknown };
    if (block.type === "paragraph") {
      const text = typeof block.text === "string" ? block.text : "";
      for (const line of text.split("\n")) nodes.push(textParagraph(line));
    } else if (block.type === "math") {
      nodes.push({ type: "mathBlock", attrs: { latex: typeof block.latex === "string" ? block.latex : "" } });
    }
  }
  if (nodes.length === 0) nodes.push({ type: "paragraph" });
  return {
    format: "mathpress",
    schemaVersion: 3,
    id: d.id as string,
    title,
    language: "ar",
    direction: "rtl",
    page: structuredClone(DEFAULT_PAGE),
    headerText: "",
    footerText: "",
    showPageNumbers: true,
    content: { type: "doc", content: nodes },
    updatedAt: typeof d.updatedAt === "string" ? d.updatedAt : new Date().toISOString()
  };
}

/** يقرأ أي مستند MathPress (النسخة 1 أو 2 أو 3) ويعيده بصيغة النسخة 3، أو null إن كان غير صالح. */
export function parseDocument(raw: unknown): MathPressDocument | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  if (d.format !== "mathpress" || typeof d.id !== "string" || typeof d.title !== "string") return null;
  if (d.schemaVersion === 1) return migrateV1(d);
  if ((d.schemaVersion !== 2 && d.schemaVersion !== 3) || !isDocJson(d.content)) return null;
  const page = d.page as Partial<PageSettings> | undefined;
  const m = page?.marginsMm;
  const margins = m && [m.top, m.right, m.bottom, m.left].every(n => typeof n === "number" && n >= 0 && n < 60)
    ? m : DEFAULT_PAGE.marginsMm;
  return {
    format: "mathpress",
    schemaVersion: 3,
    id: d.id,
    title: d.title,
    language: "ar",
    direction: "rtl",
    page: {
      size: "A4",
      orientation: page?.orientation === "landscape" ? "landscape" : "portrait",
      marginsMm: { ...margins }
    },
    headerText: typeof d.headerText === "string" ? d.headerText : "",
    footerText: typeof d.footerText === "string" ? d.footerText : "",
    showPageNumbers: d.showPageNumbers !== false,
    content: d.content,
    updatedAt: typeof d.updatedAt === "string" ? d.updatedAt : new Date().toISOString()
  };
}
