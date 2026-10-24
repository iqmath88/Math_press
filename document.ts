import type { MathPressDocument } from "./types";

export function createDocument(title = "ملزمة رياضيات"): MathPressDocument {
  const now = new Date().toISOString();
  return {
    format: "mathpress",
    schemaVersion: 1,
    id: crypto.randomUUID(),
    title,
    language: "ar",
    direction: "rtl",
    page: {
      size: "A4",
      orientation: "portrait",
      marginsMm: { top: 20, right: 18, bottom: 20, left: 18 }
    },
    content: [
      { id: crypto.randomUUID(), type: "paragraph", text: "اكتب عنوان الدرس هنا" },
      { id: crypto.randomUUID(), type: "paragraph", text: "اكتب نص السؤال أو الشرح هنا." },
      { id: crypto.randomUUID(), type: "math", latex: "x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}", display: true }
    ],
    updatedAt: now
  };
}

export function validateDocument(value: unknown): value is MathPressDocument {
  if (!value || typeof value !== "object") return false;
  const d = value as Partial<MathPressDocument>;
  return d.format === "mathpress" &&
    d.schemaVersion === 1 &&
    typeof d.id === "string" &&
    typeof d.title === "string" &&
    Array.isArray(d.content) &&
    !!d.page && d.page.size === "A4" &&
    d.content.every(block =>
      !!block && typeof block === "object" &&
      typeof (block as {id?: unknown}).id === "string" &&
      ((block as {type?: unknown}).type === "paragraph" || (block as {type?: unknown}).type === "math")
    );
}