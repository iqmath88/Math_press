import { Extension, type Editor } from "@tiptap/core";

const STYLE_ID = /^[a-z][a-z0-9-]{0,49}$/;
const COLOR = /^#[a-f\d]{6}$/i;
export const styleFonts = ["Noto Naskh Arabic", "Amiri", "Cairo"] as const;
export const styleAlignments = ["start", "center", "end", "justify"] as const;

export type EducationalStyle = {
  id: string;
  name: string;
  font: typeof styleFonts[number];
  size: number;
  bold: boolean;
  color: string;
  mathColor: string;
  mathScale: number;
  background: string | null;
  border: string | null;
  padding: number;
  lineHeight: number;
  before: number;
  after: number;
  align: typeof styleAlignments[number];
  direction: "rtl" | "ltr";
  keepWithNext: boolean;
  breakBefore: boolean;
};

const plain: Omit<EducationalStyle, "id" | "name"> = {
  font: "Noto Naskh Arabic", size: 14, bold: false, color: "#161616", mathColor: "#161616",
  mathScale: 100, background: null, border: null, padding: 0, lineHeight: 1.65, before: 0,
  after: 5, align: "start", direction: "rtl", keepWithNext: false, breakBefore: false
};

const define = (id: string, name: string, attrs: Partial<typeof plain> = {}): EducationalStyle =>
  ({ ...plain, ...attrs, id, name });

export const defaultEducationalStyles: readonly EducationalStyle[] = [
  define("chapter", "عنوان الفصل", { size: 25, bold: true, align: "center", keepWithNext: true, after: 12 }),
  define("lesson", "عنوان الدرس", { size: 21, bold: true, keepWithNext: true, after: 9 }),
  define("subtitle", "عنوان فرعي", { size: 17, bold: true, keepWithNext: true }),
  define("question", "سؤال", { color: "#842d2d", mathColor: "#842d2d", bold: true }),
  define("solution", "حل", { color: "#1d3c62", mathColor: "#1d3c62" }),
  define("example", "مثال محلول", { color: "#22543d", mathColor: "#22543d", bold: true }),
  define("definition", "تعريف", { color: "#36446a", border: "#8c97b0", padding: 7 }),
  define("theorem", "نظرية", { bold: true, border: "#888888", padding: 7 }),
  define("rule", "قاعدة رياضية", { background: "#edf4f2", border: "#93aaa3", padding: 7 }),
  define("proof", "برهان", { color: "#283646" }),
  define("note", "ملاحظة", { background: "#f5f2e7", padding: 7 }),
  define("warning", "تنبيه", { color: "#742f24", background: "#faf1eb", padding: 7 }),
  define("exercise", "تمرين", { bold: true }),
  define("homework", "واجب", { color: "#453779" }),
  define("ministerial", "سؤال وزاري", { color: "#78273d", bold: true }),
  define("normal", "نص عادي")
];

export function validStyleId(id: unknown): id is string {
  return typeof id === "string" && STYLE_ID.test(id);
}

export function readEducationalStyles(raw: unknown): EducationalStyle[] {
  if (!Array.isArray(raw)) return [];
  const styles = new Map<string, EducationalStyle>();
  for (const value of raw.slice(0, 80)) {
    if (!value || !validStyleId(value.id) || typeof value.name !== "string" || !value.name.trim()) continue;
    const base = defaultEducationalStyles.find(style => style.id === value.id) ?? plain;
    const bounded = (name: keyof EducationalStyle, min: number, max: number, fallback: number) =>
      typeof value[name] === "number" && Number.isFinite(value[name]) && value[name] >= min && value[name] <= max ? value[name] : fallback;
    const color = (name: keyof EducationalStyle, fallback: string | null) =>
      typeof value[name] === "string" && COLOR.test(value[name]) ? value[name] : fallback;
    styles.set(value.id, {
      id: value.id, name: value.name.trim().slice(0, 80),
      font: styleFonts.includes(value.font) ? value.font : base.font,
      size: bounded("size", 8, 72, base.size), bold: value.bold === true,
      color: color("color", base.color) ?? base.color, mathColor: color("mathColor", base.mathColor) ?? base.mathColor,
      mathScale: bounded("mathScale", 50, 200, base.mathScale),
      background: value.background === null ? null : color("background", base.background),
      border: value.border === null ? null : color("border", base.border),
      padding: bounded("padding", 0, 32, base.padding), lineHeight: bounded("lineHeight", 1, 3, base.lineHeight),
      before: bounded("before", 0, 80, base.before), after: bounded("after", 0, 80, base.after),
      align: styleAlignments.includes(value.align) ? value.align : base.align,
      direction: value.direction === "ltr" ? "ltr" : "rtl",
      keepWithNext: value.keepWithNext === true, breakBefore: value.breakBefore === true
    });
  }
  return [...styles.values()];
}

export function resolveEducationalStyles(overrides: EducationalStyle[] = []) {
  const styles = new Map(defaultEducationalStyles.map(style => [style.id, style]));
  for (const style of overrides) styles.set(style.id, style);
  return [...styles.values()];
}

export function educationalStyleDeclarations(style: EducationalStyle) {
  return `font-family:"${style.font}",serif;font-size:${style.size}pt;font-weight:${style.bold ? 700 : 400};
    color:${style.color};background-color:${style.background ?? "transparent"};
    border:${style.border ? `1px solid ${style.border}` : "0"};padding:${style.padding}px;
    padding-block-start:${style.padding + style.before}px;padding-block-end:${style.padding + style.after}px;
    line-height:${style.lineHeight};text-align:${style.align};direction:${style.direction};
    --educational-math-color:${style.mathColor};--educational-math-scale:${style.mathScale / 100}em;
    --keep-with-next:${Number(style.keepWithNext)};--break-before:${Number(style.breakBefore)};`;
}

export function applyEducationalStyle(editor: Editor, id: string | null) {
  if (id !== null && !validStyleId(id)) return;
  updateParagraphAttributes(editor, { educationalStyle: id });
}

export function updateParagraphAttributes(editor: Editor, attrs: Record<string, unknown>) {
  const { tr, selection } = editor.state;
  const from = selection.from;
  const to = selection.empty ? from : selection.to - 1;
  tr.doc.nodesBetween(from, Math.max(from, to), (node, pos) => {
    if (node.type.name === "paragraph" || node.type.name === "heading") {
      for (const [name, value] of Object.entries(attrs)) tr.setNodeAttribute(pos, name, value);
      return false;
    }
  });
  if (tr.docChanged) editor.view.dispatch(tr);
  editor.commands.focus();
}

const educationalSequences = ["question", "example", "exercise"];

export const EducationalStyleAttributes = Extension.create({
  name: "educationalStyle",
  addGlobalAttributes() {
    return [{
      types: ["paragraph", "heading"],
      attributes: {
        educationalSequence: {
          default: null,
          parseHTML: element => {
            const seq = element.getAttribute("data-educational-sequence");
            return seq && educationalSequences.includes(seq) ? seq : null;
          },
          renderHTML: attrs => educationalSequences.includes(attrs.educationalSequence)
            ? { "data-educational-sequence": attrs.educationalSequence } : {}
        },
        educationalStyle: {
          default: null,
          parseHTML: element => {
            const style = element.getAttribute("data-educational-style");
            return validStyleId(style) ? style : null;
          },
          renderHTML: attrs => validStyleId(attrs.educationalStyle)
            ? { "data-educational-style": attrs.educationalStyle } : {}
        }
      }
    }];
  }
});
