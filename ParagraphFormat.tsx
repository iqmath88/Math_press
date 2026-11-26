import { Extension, type Editor } from "@tiptap/core";
import { useState } from "react";
import { updateParagraphAttributes } from "./educationalStyles";

const fields = [
  ["lineHeight", "تباعد الأسطر", 1, 3, 0.05], ["before", "مسافة قبل (بكسل)", 0, 80, 1],
  ["after", "مسافة بعد (بكسل)", 0, 80, 1], ["indent", "مسافة بادئة (بكسل)", 0, 120, 1],
  ["firstLine", "بادئة السطر الأول (بكسل)", 0, 120, 1], ["hanging", "بادئة معلقة (بكسل)", 0, 120, 1]
] as const;
const flags = [
  ["keepWithNext", "إبقاء مع الفقرة التالية"], ["keepLines", "إبقاء الأسطر معًا"],
  ["breakBefore", "بدء صفحة جديدة"], ["widows", "حماية أول وآخر سطرين"]
] as const;

type Field = typeof fields[number][0];
type Flag = typeof flags[number][0];
type Format = Partial<Record<Field, number> & Record<Flag, boolean>> & { border?: string; background?: string };
const colorPattern = /^#[a-f\d]{6}$/i;

export function readParagraphFormat(value: unknown): Format | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const result: Format = {};
  for (const [key, , min, max] of fields) {
    const n = raw[key];
    if (typeof n === "number" && n >= min && n <= max) result[key] = n;
  }
  for (const [flag] of flags) {
    const enabled = raw[flag];
    if (typeof enabled === "boolean") result[flag] = enabled;
  }
  for (const key of ["border", "background"] as const) {
    const color = raw[key];
    if (typeof color === "string" && colorPattern.test(color)) result[key] = color;
  }
  return Object.keys(result).length ? result : null;
}

function formatCss(format: Format) {
  const rules: string[] = [];
  if (format.lineHeight !== undefined) rules.push(`line-height:${format.lineHeight}`);
  if (format.before !== undefined) rules.push(`padding-block-start:${format.before}px`);
  if (format.after !== undefined) rules.push(`padding-block-end:${format.after}px`);
  if (format.indent !== undefined || format.hanging !== undefined)
    rules.push(`padding-inline-start:${(format.indent ?? 0) + (format.hanging ?? 0)}px`);
  if (format.firstLine !== undefined || format.hanging !== undefined)
    rules.push(`text-indent:${(format.firstLine ?? 0) - (format.hanging ?? 0)}px`);
  if (format.border) rules.push(`border:1px solid ${format.border}`);
  if (format.background) rules.push(`background-color:${format.background}`);
  if (format.keepWithNext !== undefined) rules.push(`--keep-with-next:${Number(format.keepWithNext)}`);
  if (format.breakBefore !== undefined) rules.push(`--break-before:${Number(format.breakBefore)}`);
  if (format.keepLines !== undefined) rules.push(`break-inside:${format.keepLines ? "avoid" : "auto"}`);
  if (format.widows !== undefined) rules.push(`widows:${format.widows ? 2 : 1}`, `orphans:${format.widows ? 2 : 1}`);
  return rules.join(";");
}

export const ParagraphFormatAttributes = Extension.create({
  name: "paragraphFormat",
  addGlobalAttributes() {
    return [{
      types: ["paragraph", "heading"],
      attributes: {
        paragraphFormat: {
          default: null,
          parseHTML: node => {
            try { return readParagraphFormat(JSON.parse(node.getAttribute("data-paragraph-format") ?? "null")); }
            catch { return null; }
          },
          renderHTML: attrs => {
            const format = readParagraphFormat(attrs.paragraphFormat);
            return format ? { "data-paragraph-format": JSON.stringify(format), style: formatCss(format) } : {};
          }
        }
      }
    }];
  }
});

export function selectedParagraphFormat(editor: Editor) {
  return readParagraphFormat(editor.state.selection.$from.parent.attrs.paragraphFormat);
}

export default function ParagraphFormatDialog({ editor, close }: { editor: Editor; close: () => void }) {
  const [draft, setDraft] = useState<Format>(() => selectedParagraphFormat(editor) ?? {});
  const finish = (format: Format | null) => {
    updateParagraphAttributes(editor, { paragraphFormat: format });
    close();
  };

  return (
    <div className="modal-backdrop no-print" onClick={close}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="تنسيق الفقرة"
        onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === "Escape") close(); }}>
        <strong>تنسيق الفقرة</strong>
        <div className="style-fields">
          {fields.map(([key, label, min, max, step]) => (
            <label className="gfield" key={key}>{label}
              <input type="number" min={min} max={max} step={step} value={draft[key] ?? ""} placeholder="افتراضي"
                onChange={e => setDraft({ ...draft, [key]: Number.isNaN(e.target.valueAsNumber) ? undefined : e.target.valueAsNumber })} />
            </label>
          ))}
          {([["border", "الحدود"], ["background", "الخلفية"]] as const).map(([key, label]) =>
            <label className="gfield" key={key}>{label}<input type="color" value={draft[key] ?? "#ffffff"}
              onChange={e => setDraft({ ...draft, [key]: e.target.value })} />
              <button type="button" onClick={() => setDraft({ ...draft, [key]: undefined })}>إزالة {label}</button>
            </label>)}
        </div>
        <div className="grow-row">
          {flags.map(([key, label]) => <label className="gfield" key={key}>{label}
            <select value={draft[key] === undefined ? "" : String(draft[key])}
              onChange={e => setDraft({ ...draft, [key]: e.target.value ? e.target.value === "true" : undefined })}>
              <option value="">افتراضي</option><option value="true">نعم</option><option value="false">لا</option>
            </select>
          </label>)}
        </div>
        <div className="modal-actions">
          <button type="button" className="primary-action" onClick={() => finish(readParagraphFormat(draft))}>تطبيق</button>
          <button type="button" onClick={() => finish(null)}>إزالة تنسيق الفقرة</button>
          <button type="button" onClick={close}>إلغاء</button>
        </div>
      </div>
    </div>
  );
}
